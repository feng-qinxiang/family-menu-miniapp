#!/usr/bin/env python3
"""后台 UGC 渲染 XSS 实测（后台每个页面都必须把用户内容当文本渲染）。

做法：先用 API 把带 payload 的昵称 / 帖子 / 评论 / 举报 / 反馈 / 菜谱 / 库存 / 许愿词写进库，
再用 CDP 真开后台每个页面，检查三件事：
  1. window.__xssp 被置位 → payload 里的 JS **真的执行了**（严重）
  2. 出现 [data-xssp] 节点  → payload 被当 HTML 解析了（HTML 注入，即使 CSP 挡住 JS 也是缺陷）
  3. innerText 里出现原文 → 被正确转义成文本（期望结果）

payload 用 <img src=x onerror=...> 与 <svg onload=...> 两种，都是"插入即成节点"的形状。

用法：python3 xss-probe-387f91.py   （输出即证据，见 07-xss.log）
"""
import importlib.util
import json
import os
import time
import urllib.error
import urllib.request

ROOT = "/Users/xx/cx/家庭点菜小程序"
OUT = ROOT + "/artifacts/launch-2026-09-23/backend"
APP = "http://127.0.0.1:18082"

SPEC = importlib.util.spec_from_file_location("sweep", ROOT + "/.cursor/admin-click-sweep-387f91.py")
S = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(S)
S.APP = APP
S.ADMIN_URL = APP + "/admin/"
S.PROFILE = "/tmp/fm-be-xss-profile-387f91"
S.DL = "/tmp/fm-be-xss-downloads-387f91"
S.PORT = 9225

IMG = '<img src=x onerror="window.__xssp=(window.__xssp||0)+1" data-xssp="1">'
SVG = '<svg onload="window.__xssp=(window.__xssp||0)+1" data-xssp="1"></svg>'
MARK = "XSSP387F91"


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
        return e.code, e.read().decode("utf-8", "replace")[:200]
    except Exception as e:
        return -1, str(e)


# ---------------------------------------------------------------- 造数据
req = urllib.request.Request(APP + "/api/auth/guest", data=b"{}", method="POST")
req.add_header("Content-Type", "application/json")
req.add_header("X-Device-Id", "xss-probe-" + str(int(time.time() * 1000)))
with urllib.request.urlopen(req, timeout=20) as r:
    guest = json.loads(r.read())
tok = guest["token"]

seed = {}
seed["nickname"] = call("PATCH", "/api/auth/me", tok, {"nickname": IMG + MARK})[0]
seed["recipe"] = call("POST", "/api/recipes", tok, {
    "title": SVG + MARK, "summary": IMG + MARK, "cuisine": "家常",
    "tasteTags": [MARK], "steps": [{"text": IMG + MARK}],
    "ingredients": [{"name": IMG + MARK, "amount": "1"}]})[0]
seed["post"] = call("POST", "/api/community/posts", tok, {
    "title": IMG + MARK, "content": SVG + MARK, "tags": [MARK]})[0]
_, post = call("GET", "/api/community/posts?size=1", tok)
post_id = 0
for p in (post if isinstance(post, list) else []):
    if MARK in json.dumps(p, ensure_ascii=False):
        post_id = p.get("id")
seed["comment"] = call("POST", "/api/community/posts/%s/comments" % post_id, tok,
                       {"content": IMG + MARK})[0] if post_id else "skip"
seed["report"] = call("POST", "/api/community/posts/%s/report" % post_id, tok,
                      {"reason": IMG + MARK, "description": SVG + MARK})[0] if post_id else "skip"
seed["feedback"] = call("POST", "/api/feedback", tok, {
    "types": ["BUG"], "content": IMG + MARK, "contact": SVG + MARK})[0]
seed["pantry"] = call("POST", "/api/pantry", tok, {"ingredientName": IMG + MARK, "amount": "1"})[0]
seed["wish"] = call("POST", "/api/wishes", tok, {
    "date": time.strftime("%Y-%m-%d"), "slot": "dinner", "text": SVG + MARK})[0]
seed["family"] = call("POST", "/api/family", tok, {"name": IMG + MARK})[0]
print("写入结果（HTTP 状态，200=payload 已进库）：", json.dumps(seed, ensure_ascii=False))

# ---------------------------------------------------------------- 打开后台逐页检查
JS = """(function(){
  var bad=document.querySelectorAll('[data-xssp]').length;
  var lit=(document.body.innerText||'').indexOf('data-xssp')>=0 ? 1 : 0;
  return JSON.stringify({xss: window.__xssp||0, badNodes: bad, literal: lit});
})()"""

ws_url = S.boot_chrome()
cdp = S.CDP(ws_url)
for m in ("Page.enable", "Runtime.enable", "Log.enable", "Network.enable"):
    cdp.send(m)
cdp.send("Page.setDownloadBehavior", {"behavior": "allow", "downloadPath": S.DL})

S.do_login_flows(cdp, rate_limit_test=False)
print("后台已登录")

tabs = ["dashboard", "posts", "comments", "reports", "imports", "users",
        "families", "menus", "shopping", "pantry", "orders", "feedback",
        "recipes", "audit"]
result = {}
critical = []
for tab in tabs:
    cdp.js("(function(){var e=document.querySelector('[data-tab=%s]');if(e){e.click();return 1}return 0})()"
           % json.dumps(tab))
    S.wait_idle(cdp, 8)
    time.sleep(0.4)
    st = json.loads(cdp.js(JS))
    result[tab] = st
    flag = "OK " if (st["xss"] == 0 and st["badNodes"] == 0) else "!! "
    if st["xss"]:
        critical.append(tab)
    print("  %s %-10s js执行=%s HTML节点=%s 转义成文本=%s"
          % (flag, tab, st["xss"], st["badNodes"], st["literal"]))

# 帖子/举报/菜谱的详情弹窗也要看（详情里字段更多）
for tab, key in [("posts", "postdetail"), ("reports", "reportdetail"), ("recipes", "recipedetail")]:
    cdp.js("(function(){var e=document.querySelector('[data-tab=%s]');if(e)e.click()})()" % json.dumps(tab))
    S.wait_idle(cdp, 8)
    clicked = cdp.js("""(function(){
      var b=document.querySelector('[data-%s]'); if(!b) return 0; b.click(); return 1;})()""" % key)
    if not clicked:
        print("  -- %s 没有详情按钮（该页无数据）" % tab)
        continue
    time.sleep(0.8)
    st = json.loads(cdp.js(JS))
    result[tab + "#detail"] = st
    flag = "OK " if (st["xss"] == 0 and st["badNodes"] == 0) else "!! "
    if st["xss"]:
        critical.append(tab + "#detail")
    print("  %s %-10s js执行=%s HTML节点=%s 转义成文本=%s"
          % (flag, tab + "#detail", st["xss"], st["badNodes"], st["literal"]))
    cdp.js("(function(){var e=document.querySelector('#modalRoot button');if(e)e.click()})()")
    time.sleep(0.3)

verdict = "FAIL" if critical else "PASS"
summary = {"seed": seed, "pages": result, "verdict": verdict, "executed_in": critical,
           "exceptions": cdp.exceptions[:5]}
with open(os.path.join(OUT, "xss-probe-current.json"), "w") as f:
    json.dump(summary, f, ensure_ascii=False, indent=1)
print("\n================ 结论 ================")
print("verdict=%s；发生 JS 执行的页面=%s" % (verdict, critical or "无"))
print("清单已写：%s/xss-probe-current.json" % OUT)
