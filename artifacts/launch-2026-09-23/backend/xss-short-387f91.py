#!/usr/bin/env python3
"""补充 XSS 证据：主探测（xss-probe-387f91.py）的 payload 有 70 字符，
被「昵称 / 家庭名 / 举报理由」的字段长度限制挡在 400（`数据不符合要求`），
所以那三条渲染路径没被真正验证过。这里换 36 字符的等价 payload 再走一遍。

检查口径与主探测一致：`window.__xssp` 被置位 = JS 真执行（严重）；
`[data-xssp]` 节点 = 被当 HTML 解析；innerText 出现原文 = 正确转义成文本。

用法：python3 xss-short-387f91.py    （证据见 10-xss-short.log）
"""
import importlib.util
import json
import time
import urllib.request

ROOT = "/Users/xx/cx/家庭点菜小程序"
OUT = ROOT + "/artifacts/launch-2026-09-23/backend"
APP = "http://127.0.0.1:18082"

SPEC = importlib.util.spec_from_file_location("sweep", ROOT + "/.cursor/admin-click-sweep-387f91.py")
S = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(S)
S.APP = APP
S.ADMIN_URL = APP + "/admin/"
S.PROFILE = "/tmp/fm-be-xss-short-387f91"
S.DL = "/tmp/fm-be-xss-short-downloads-387f91"
S.PORT = 9228

PAY = "<svg onload=__xssp=1 data-xssp=1>"
MARK = "XSSSHORT387F91"
print("payload 长度 %d（昵称/家庭名 ≤ 80，举报理由 ≤ 64）" % len(PAY + MARK))

# 游客接口需要 X-Device-Id，主探测脚本里的 call 就是这么带的；这里照抄一份（12 行，不值得再抽公共模块）
def call(method, path, token=None, body=None, device=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(APP + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("X-Auth-Token", token)
    if device:
        req.add_header("X-Device-Id", device)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read().decode("utf-8", "replace")
            return r.status, (json.loads(raw) if raw.strip().startswith(("[", "{")) else raw)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:200]
    except Exception as e:
        return -1, str(e)


st, guest = call("POST", "/api/auth/guest", device="xss-short-" + str(int(time.time() * 1000)), body={})
tok = guest["token"]

seed = {}
seed["nickname"] = call("PATCH", "/api/auth/me", tok, {"nickname": PAY + MARK})[0]
seed["family"] = call("POST", "/api/family", tok, {"name": PAY + MARK})[0]
st, body = call("POST", "/api/community/posts", tok,
                {"title": "xss short probe " + MARK, "content": MARK + " content"})
post_id = body.get("id") if isinstance(body, dict) else None
seed["post"] = st
seed["report"] = call("POST", "/api/community/posts/%s/report" % post_id, tok,
                      {"reason": PAY + MARK})[0] if post_id else "skip"
print("写入结果（200=payload 已进库）：", json.dumps(seed, ensure_ascii=False))

ws = S.boot_chrome()
cdp = S.CDP(ws)
for m in ("Page.enable", "Runtime.enable", "Log.enable", "Network.enable"):
    cdp.send(m)
S.do_login_flows(cdp, rate_limit_test=False)
print("后台已登录")

JS = """JSON.stringify((function(){
  return {xss: window.__xssp || 0, bad: document.querySelectorAll('[data-xssp]').length,
          literal: (document.body.innerText||'').indexOf(%s) >= 0 ? 1 : 0};
})())""" % json.dumps(MARK)

fails = []
for tab in ("users", "families", "reports", "posts", "comments"):
    cdp.js("(function(){var e=document.querySelector('[data-tab=%s]');if(e)e.click()})()" % json.dumps(tab))
    S.wait_idle(cdp, 10)
    time.sleep(0.5)
    st = json.loads(cdp.js(JS))
    ok = st["xss"] == 0 and st["bad"] == 0
    if not ok:
        fails.append(tab)
    print("  %s %-10s js执行=%s HTML节点=%s 转义成文本=%s"
          % ("OK " if ok else "!! ", tab, st["xss"], st["bad"], st["literal"]))

print("\nverdict=%s；失败页=%s" % ("PASS" if not fails else "FAIL", fails or "无"))
with open(OUT + "/xss-short-current.json", "w") as f:
    json.dump({"seed": seed, "fails": fails, "verdict": "PASS" if not fails else "FAIL"}, f,
              ensure_ascii=False, indent=1)
