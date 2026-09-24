#!/usr/bin/env python3
"""跨家庭越权实测（三条主线：家庭点菜 / 家庭做菜 / 社区）。

做法：建两个游客家庭 A、B，A 真实写入各类数据，再用 B 的 token 去读/改/删 A 的资源。
期望：一律 403/404，且 B 的列表接口里不出现 A 的数据（不泄露存在性）。
数据都是运行时新建的，不依赖任何预置 id，换库换环境都能跑。

用法：python3 isolation-probe-387f91.py   （输出即证据，见 05-isolation.log）
"""
import json
import time
import urllib.error
import urllib.request

APP = "http://127.0.0.1:18082"
fails = []
rows = []
RUN = str(int(time.time() * 1000))   # 每次运行独立的设备 id，两个游客才是两个家庭


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
    except Exception as e:  # 连接失败也算失败
        return -1, str(e)


def login(device):
    req = urllib.request.Request(APP + "/api/auth/guest", data=b"{}", method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("X-Device-Id", device)
    with urllib.request.urlopen(req, timeout=20) as r:
        body = json.loads(r.read())
    return body["token"], body["user"]["familyId"]


def check(name, expect, got_status, extra=""):
    ok = got_status in expect
    if not ok:
        fails.append(name)
    rows.append((ok, name, expect, got_status, extra))
    print("  %s %-46s 期望=%s 实际=%s %s" % ("OK " if ok else "!! ", name,
                                             "/".join(map(str, expect)), got_status, extra))
    return ok


tok_a, fam_a = login("probe-a-" + RUN)
tok_b, fam_b = login("probe-b-" + RUN)
print("两个游客家庭已建立：A=family %s，B=family %s" % (fam_a, fam_b))
assert fam_a != fam_b, "两次游客登录落在同一个家庭，越权测试没有意义"

# ---------- A 真实写入三条主线的数据 ----------
st, recipe = call("POST", "/api/recipes", tok_a, {
    "title": "越权探针菜 A", "cuisine": "家常", "tasteTags": ["咸鲜"],
    "timeCost": 10, "servings": 2, "difficulty": "easy",
    "steps": [{"text": "随便炒炒"}], "ingredients": [{"name": "盐", "amount": "少许"}]})
print("A 建私房菜:", st, recipe if st != 200 else recipe.get("id"))
rid = recipe.get("id")

st, pantry = call("POST", "/api/pantry", tok_a, {"ingredientName": "越权探针食材A", "amount": "1"})
print("A 加库存:", st, pantry if st != 200 else pantry.get("id"))
pid = pantry.get("id")

st, cook = call("POST", "/api/cook-history", tok_a, {"recipeId": rid, "score": 5})
print("A 记做菜:", st)
st, menu = call("POST", "/api/daily-menu/today/items", tok_a, {"recipeId": rid})
print("A 加入点菜:", st)
st, post = call("POST", "/api/community/posts", tok_a, {
    "title": "越权探针帖 A", "content": "跨家庭不该看得到这条", "tags": []})
print("A 发帖:", st, post if st != 200 else post.get("id"))
post_id = post.get("id")

# ---------- 0. 自证：A 读自己的数据必须成功 ----------
print("\n=== 0. 自证（A 读自己，应当全部成功）===")
check("A 读自己的私房菜", (200,), call("GET", "/api/recipes/%s" % rid, tok_a)[0])
check("A 读自己的库存列表", (200,), call("GET", "/api/pantry", tok_a)[0])
check("A 读自己的做菜记录", (200,), call("GET", "/api/cook-history", tok_a)[0])

# ---------- 1. 家庭点菜主线 ----------
print("\n=== 1. 家庭点菜（B 动 A 的菜谱 / 菜单）===")
check("B 读 A 的私房菜", (403, 404), call("GET", "/api/recipes/%s" % rid, tok_b)[0])
check("B 改 A 的私房菜", (403, 404), call("PUT", "/api/recipes/%s" % rid, tok_b, {"title": "改了"})[0])
check("B 把 A 的菜加进自己菜单", (403, 404),
      call("POST", "/api/daily-menu/today/items", tok_b, {"recipeId": rid})[0])
_, b_recipes = call("GET", "/api/recipes?source=owned", tok_b)
leak = [r for r in b_recipes if isinstance(r, dict) and r.get("id") == rid] if isinstance(b_recipes, list) else []
check("B 的菜谱列表不含 A 的私房菜", (0,), len(leak))

# ---------- 2. 家庭做菜主线 ----------
print("\n=== 2. 家庭做菜（B 动 A 的库存 / 做菜记录）===")
check("B 用 A 的菜谱记做菜", (403, 404),
      call("POST", "/api/cook-history", tok_b, {"recipeId": rid})[0])
check("B 删 A 的库存条目", (403, 404), call("DELETE", "/api/pantry/%s" % pid, tok_b)[0])
_, b_pantry = call("GET", "/api/pantry", tok_b)
leak = [i for i in b_pantry if isinstance(i, dict) and i.get("itemId") == pid] if isinstance(b_pantry, list) else []
check("B 的库存列表不含 A 的条目", (0,), len(leak))
_, b_cook = call("GET", "/api/cook-history", tok_b)
leak = [i for i in b_cook if isinstance(i, dict) and i.get("recipeId") == rid] if isinstance(b_cook, list) else []
check("B 的做菜记录不含 A 的记录", (0,), len(leak))
_, b_menu = call("GET", "/api/daily-menu/today", tok_b)
items = b_menu.get("items", []) if isinstance(b_menu, dict) else []
leak = [i for i in items if isinstance(i, dict) and i.get("recipeId") == rid]
check("B 的今日菜单不含 A 的菜", (0,), len(leak))
_, b_shop = call("GET", "/api/shopping-list/today", tok_b)
items = b_shop.get("items", []) if isinstance(b_shop, dict) else []
leak = [i for i in items if "越权探针" in json.dumps(i, ensure_ascii=False)]
check("B 的采购清单不含 A 的食材", (0,), len(leak))

# ---------- 3. 社区主线 ----------
print("\n=== 3. 社区（B 动 A 的帖子）===")
# 未配微信凭据 → 机审不可用 → 帖子为 PENDING，只有作者可见
check("B 读 A 的待审帖", (403, 404), call("GET", "/api/community/posts/%s" % post_id, tok_b)[0])
check("B 评论 A 的待审帖", (403, 404),
      call("POST", "/api/community/posts/%s/comments" % post_id, tok_b, {"content": "越权评论"})[0])
check("B 点赞 A 的待审帖", (403, 404),
      call("POST", "/api/community/posts/%s/like" % post_id, tok_b)[0])
check("B 收藏 A 的待审帖", (403, 404),
      call("POST", "/api/community/posts/%s/favorite" % post_id, tok_b)[0])
check("B 举报 A 的待审帖", (403, 404),
      call("POST", "/api/community/posts/%s/report" % post_id, tok_b, {"reason": "测试"})[0])
_, feed = call("GET", "/api/community/posts", tok_b)
leak = [p for p in feed if isinstance(p, dict) and p.get("id") == post_id] if isinstance(feed, list) else []
check("B 的信息流不含 A 的待审帖", (0,), len(leak))

# ---------- 4. 匿名 ----------
print("\n=== 4. 匿名（不带 token）===")
for path in ["/api/recipes", "/api/cook-history", "/api/pantry", "/api/home/dashboard",
             "/api/daily-menu/today", "/api/shopping-list/today"]:
    check("匿名 %s" % path, (401,), call("GET", path)[0])

print("\n================ 结果 ================")
print("失败 %d / 共 %d" % (len(fails), len(rows)))
if fails:
    print("失败项：", fails)
