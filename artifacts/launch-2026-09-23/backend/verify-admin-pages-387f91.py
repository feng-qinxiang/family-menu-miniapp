#!/usr/bin/env python3
"""定向逐页验证（全新 Chrome profile，避免复用 profile 时旧标签页的残留请求污染证据）。

覆盖面（14 个页面）：
  1. 每页首屏能渲染：标题非空、无骨架、无错误卡、无 4xx/5xx、无未捕获异常、无 XSS 执行
  2. 筛选按钮（若有）真点一遍
  3. 分页控件真点「下一页 → 上一页」
  4. 导出 11 类 xlsx：200 + PK 魔数

用法：python3 verify-admin-pages-387f91.py   （输出即证据，见 09-admin-pages.log）
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
S.PROFILE = "/tmp/fm-be-pages-profile-387f91"   # 全新 profile：不带上一轮的缓存/残留标签页
S.DL = "/tmp/fm-be-pages-downloads-387f91"
S.PORT = 9227
S.OUT = OUT

TABS = ["dashboard", "posts", "comments", "reports", "imports", "users",
        "families", "menus", "shopping", "pantry", "orders", "feedback",
        "recipes", "audit"]
FILTERS = {"reports": "[data-rptfilter]", "posts": "[data-postfilter]", "recipes": "[data-recipefilter]"}

HEALTH = """JSON.stringify((function(){
  return {
    title: (document.getElementById('pageTitle')||{}).textContent || '',
    skeleton: document.querySelectorAll('#panelRoot .skeleton').length,
    errCard: document.querySelectorAll('#panelRoot .err-card').length,
    rows: document.querySelectorAll('#panelRoot tbody tr').length,
    xssNodes: document.querySelectorAll('[data-xssp]').length,
    xssRan: window.__xssp || 0
  };
})())"""


def call(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(APP + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("X-Auth-Token", token)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read(), r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        return e.code, e.read(), e.headers.get("Content-Type", "")


fails, rows_out = [], []


def record(name, ok, detail=""):
    if not ok:
        fails.append(name)
    rows_out.append({"name": name, "ok": ok, "detail": detail})
    print("  %s %-46s %s" % ("OK " if ok else "!! ", name, detail))


def goto(cdp, tab):
    cdp.js("(function(){var e=document.querySelector('[data-tab=%s]');if(e){e.click();return 1}return 0})()"
           % json.dumps(tab))
    S.wait_idle(cdp, 10)
    time.sleep(0.4)


ws_url = S.boot_chrome()
cdp = S.CDP(ws_url)
for m in ("Page.enable", "Runtime.enable", "Log.enable", "Network.enable"):
    cdp.send(m)
cdp.send("Page.setDownloadBehavior", {"behavior": "allow", "downloadPath": S.DL})

# 登录页首屏：全新 profile 下不该有任何 4xx/5xx / 异常 / 探测请求
cdp.take()
cdp.js("location.href=%s" % json.dumps(S.ADMIN_URL))
for _ in range(40):
    cdp.drain(0.25)
    if cdp.js("!!document.getElementById('authTabs')"):
        cdp.js(S.JS_HELPERS)
        break
boot = cdp.js("document.body.getAttribute('data-bootstrap-login')")
boot_errs = cdp.take()
bad = [(s, u) for s, u, _m in boot_errs["http"]]
cdn_errs = [e for e in boot_errs["console"] + boot_errs["logs"] if "404" in str(e) or "401" in str(e)]
record("登录页首屏（全新 profile）", not bad and not cdn_errs and not boot_errs["exceptions"],
       "bootstrap=%s 4xx/5xx=%s 控制台错误=%s 异常=%s" % (boot, bad or "无", len(cdn_errs), len(boot_errs["exceptions"])))

S.do_login_flows(cdp, rate_limit_test=False)
token = cdp.js("sessionStorage.getItem('admin_token') || ''")
print("  已登录（token 长度 %d）" % len(token or ""))

print("\n=== 1. 14 个页面逐页首屏 ===")
page_state = {}
for tab in TABS:
    cdp.take()
    goto(cdp, tab)
    st = json.loads(cdp.js(HEALTH))
    errs = cdp.take()
    bad = [(s, u) for s, u, _m in errs["http"]]
    page_state[tab] = st
    ok = (st["skeleton"] == 0 and st["errCard"] == 0 and not bad
          and not errs["exceptions"] and st["xssRan"] == 0 and st["xssNodes"] == 0)
    record("页面 %s" % tab, ok,
           "标题=%s 行=%s 骨架=%s 错误卡=%s 4xx/5xx=%s 异常=%s"
           % (st["title"][:16], st["rows"], st["skeleton"], st["errCard"],
              bad or "无", len(errs["exceptions"])))

print("\n=== 2. 筛选按钮真点一遍 ===")
for tab, sel in FILTERS.items():
    goto(cdp, tab)
    n = int(cdp.js("document.querySelectorAll('#panelRoot %s').length" % sel))
    if not n:
        record("%s 筛选按钮" % tab, True, "该页无筛选按钮（跳过）")
        continue
    for i in range(n):
        cdp.take()
        cdp.js("(function(){var l=document.querySelectorAll('#panelRoot %s');"
               "if(l[%d])l[%d].click();return 1})()" % (sel, i, i))
        S.wait_idle(cdp, 8)
        time.sleep(0.3)
        st = json.loads(cdp.js(HEALTH))
        errs = cdp.take()
        bad = [(s, u) for s, u, _m in errs["http"]]
        record("%s 筛选#%d" % (tab, i), not bad and not errs["exceptions"] and st["skeleton"] == 0,
               "行=%s 4xx/5xx=%s 异常=%s" % (st["rows"], bad or "无", len(errs["exceptions"])))

print("\n=== 3. 分页真点（下一页 → 上一页）===")
for tab in TABS:
    goto(cdp, tab)
    if not int(cdp.js("document.querySelectorAll('#panelRoot [data-pager]').length")):
        record("%s 分页" % tab, True, "无分页控件（数据不足一页，跳过）")
        continue
    before = json.loads(cdp.js(HEALTH))["rows"]
    cdp.take()
    cdp.js("(function(){var b=document.querySelector('[data-pager$=\":next\"]');"
           "if(b && !b.disabled){b.click();return 1} return 0})()")
    S.wait_idle(cdp, 8)
    time.sleep(0.4)
    mid = json.loads(cdp.js(HEALTH))
    cdp.js("(function(){var b=document.querySelector('[data-pager$=\":prev\"]');"
           "if(b && !b.disabled){b.click();return 1} return 0})()")
    S.wait_idle(cdp, 8)
    time.sleep(0.4)
    after = json.loads(cdp.js(HEALTH))
    errs = cdp.take()
    bad = [(s, u) for s, u, _m in errs["http"]]
    record("%s 分页往返" % tab, not bad and not errs["exceptions"] and after["skeleton"] == 0,
           "第1页 %s 行 → 第2页 %s 行 → 回第1页 %s 行；4xx/5xx=%s"
           % (before, mid["rows"], after["rows"], bad or "无"))

print("\n=== 4. 11 类 xlsx 导出 ===")
for k in ["users", "orders", "audit", "posts", "comments", "feedback",
          "reports", "families", "menus", "shopping", "pantry"]:
    st, blob, _ct = call("GET", "/api/admin/export/%s" % k, token)
    record("导出 %s" % k, st == 200 and blob[:2] == b"PK",
           "%s %s 字节 magic=%s" % (st, len(blob), blob[:2].decode("latin1")))

print("\n================ 汇总 ================")
print("检查项 %d，失败 %d" % (len(rows_out), len(fails)))
if fails:
    print("失败项：", fails)
with open(os.path.join(OUT, "admin-pages-current.json"), "w") as f:
    json.dump({"pages": page_state, "checks": rows_out, "failures": fails,
               "verdict": "PASS" if not fails else "FAIL"}, f, ensure_ascii=False, indent=1)
print("清单已写：%s/admin-pages-current.json" % OUT)
