#!/usr/bin/env python3
"""账号注销（人工通道）实测：匿名化脚本是否真的注销掉一个账号，且不破坏引用完整性。

只在本地上线冲刺库 fm_be_launch_db 上跑；不碰任何生产库。
用法：python3 purge-probe-387f91.py   （输出即证据，见 06-account-purge.log）
"""
import json
import subprocess
import time
import urllib.error
import urllib.request

APP = "http://127.0.0.1:18082"
DB = "fm_be_launch_db"
MYSQL = ["mysql", "-uroot", "-p123456", DB, "-e"]
rows = []
fails = []


def sql(stmt, quiet=True):
    r = subprocess.run(MYSQL + [stmt], capture_output=True, text=True)
    return r.stdout


def call(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(APP + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("X-Auth-Token", token)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read().decode("utf-8", "replace")
            return r.status, (json.loads(raw) if raw.strip().startswith(("[", "{")) else raw)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw[:200]


def check(name, ok, detail=""):
    if not ok:
        fails.append(name)
    rows.append((ok, name, detail))
    print("  %s %-44s %s" % ("OK " if ok else "!! ", name, detail))


# ---------- 1. 造一个真实的用户：游客登录 + 发帖 + 建菜 + 记库存 ----------
dev = "purge-probe-" + str(int(time.time() * 1000))
req = urllib.request.Request(APP + "/api/auth/guest", data=b"{}", method="POST")
req.add_header("Content-Type", "application/json")
req.add_header("X-Device-Id", dev)
with urllib.request.urlopen(req, timeout=20) as r:
    login = json.loads(r.read())
tok, uid, fam = login["token"], login["user"]["userId"], login["user"]["familyId"]
print("待注销账号：user_id=%s family_id=%s" % (uid, fam))

st, recipe = call("POST", "/api/recipes", tok, {
    "title": "注销探针菜", "cuisine": "家常", "tasteTags": ["清淡"],
    "steps": [{"text": "一步"}], "ingredients": [{"name": "盐", "amount": "少许"}]})
rid = recipe.get("id")
st, post = call("POST", "/api/community/posts", tok, {"title": "注销探针帖", "content": "内容", "tags": []})
post_id = post.get("id")
call("POST", "/api/pantry", tok, {"ingredientName": "注销探针食材", "amount": "1"})
print("已造数据：recipe=%s post=%s" % (rid, post_id))
check("注销前：能读到自己的菜谱", call("GET", "/api/recipes/%s" % rid, tok)[0] == 200)

# ---------- 2. 执行匿名化（手册里的那几行 SQL）----------
print("\n=== 执行手册里的匿名化 SQL ===")
sql("DELETE FROM user_session WHERE user_id = %d;" % uid)
sql("""UPDATE user_account
          SET openid = CONCAT('guest-deleted-', id),
              unionid = NULL,
              nickname = '已注销用户',
              avatar_url = NULL,
              phone_number = NULL,
              session_key = NULL,
              gender = NULL,
              birthday = NULL,
              taste_tags_json = NULL,
              is_admin = 0,
              admin_role = NULL,
              status = 'BANNED'
        WHERE id = %d;""" % uid)
print(sql("SELECT id, openid, nickname, phone_number, status FROM user_account WHERE id=%d;" % uid))

# ---------- 3. 校验 ----------
print("\n=== 校验 ===")
check("旧 token 立刻失效（401）", call("GET", "/api/recipes/%s" % rid, tok)[0] == 401)
check("账号已匿名化（昵称/手机号清空）",
      "已注销用户" in sql("SELECT nickname FROM user_account WHERE id=%d;" % uid)
      and "NULL" in sql("SELECT phone_number FROM user_account WHERE id=%d;" % uid))
check("openid 已换成不可登录的占位",
      "guest-deleted-" in sql("SELECT openid FROM user_account WHERE id=%d;" % uid))
check("会话行已清空", sql("SELECT COUNT(*) FROM user_session WHERE user_id=%d;" % uid).strip().endswith("0"))
check("UGC 行保留（不误删社区内容）",
      "1" in sql("SELECT COUNT(*) FROM community_post WHERE id=%s;" % post_id))
check("菜谱行保留（作者指向已注销账号）",
      "1" in sql("SELECT COUNT(*) FROM recipe WHERE id=%s;" % rid))

# 同一台设备再次登录：应当是全新账号，且看不到旧数据
req = urllib.request.Request(APP + "/api/auth/guest", data=b"{}", method="POST")
req.add_header("Content-Type", "application/json")
req.add_header("X-Device-Id", dev)
with urllib.request.urlopen(req, timeout=20) as r:
    again = json.loads(r.read())
check("同设备重新登录拿到新账号（不是被注销的那个）", again["user"]["userId"] != uid,
      "新 user_id=%s" % again["user"]["userId"])
check("新账号看不到已注销账号的菜谱",
      call("GET", "/api/recipes/%s" % rid, again["token"])[0] in (403, 404))
check("新账号看不到已注销账号的待审帖",
      call("GET", "/api/community/posts/%s" % post_id, again["token"])[0] in (403, 404))

# 家庭与会员行没被误删（老库上有付费主体时靠这个保住家庭权益）
check("家庭行保留", "1" in sql("SELECT COUNT(*) FROM family WHERE id=%s;" % fam))
check("成员行保留", "1" in sql("SELECT COUNT(*) FROM family_member WHERE user_id=%d;" % uid))

print("\n================ 结果 ================")
print("失败 %d / 共 %d" % (len(fails), len(rows)))
if fails:
    print("失败项：", fails)
