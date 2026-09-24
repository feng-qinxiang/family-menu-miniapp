#!/usr/bin/env python3
"""复用前任的后台点击巡检脚本，跑在本次上线冲刺的独立实例上（18082 / fm_be_launch_db）。

不复制 757 行脚本：importlib 加载 .cursor/admin-click-sweep-387f91.py 后改常量。
唯一需要重写的是 do_401 —— 它把库名写死在函数体里（删 user_session 造真过期），
改不了常量，所以这里换成等价的本地实现。

用法：python3 drive-admin-387f91.py all|pages|login|expired
"""
import importlib.util
import json
import os
import subprocess
import sys

ROOT = "/Users/xx/cx/家庭点菜小程序"
OUT = ROOT + "/artifacts/launch-2026-09-23/backend"

SPEC = importlib.util.spec_from_file_location("sweep", ROOT + "/.cursor/admin-click-sweep-387f91.py")
S = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(S)

# ---- 本次实例的参数（与 miniapp worker 的 18081 / /tmp/fm-server-miniapp 完全隔离）
S.APP = "http://127.0.0.1:18082"
S.ADMIN_URL = S.APP + "/admin/"
S.OUT = OUT
S.PROFILE = "/tmp/fm-be-admin-profile-387f91"
S.DL = "/tmp/fm-be-admin-downloads-387f91"
S.PORT = 9224                      # CDP 调试端口，避开前任的 9223
DB = "fm_be_launch_db"

MYSQL = ["mysql", "-h127.0.0.1", "-uroot", "-p123456", DB, "-e"]


def sql(stmt):
    return subprocess.run(MYSQL + [stmt], capture_output=True, text=True).stdout


def do_401(cdp):
    """等价重写：删本实例库里的会话行，制造服务端真·过期。"""
    print("\n=== C. 会话过期（401）路径 ===")
    print("  起始状态：", cdp.js(
        "JSON.stringify({loginShown: !document.getElementById('loginView').hidden,"
        " appHidden: document.getElementById('appView').hidden,"
        " tokenLen: (sessionStorage.getItem('admin_token')||'').length,"
        " title: document.getElementById('pageTitle').textContent})"))
    sql("DELETE FROM user_session")
    print("  已删掉本库全部 user_session（真·过期）")
    S.step(cdp, "C1 会话被服务端吊销后刷新",
           lambda: cdp.js("document.getElementById('refreshBtn').click()"), settle=3.0)
    st = cdp.js("JSON.stringify({loginShown: !document.getElementById('loginView').hidden,"
                " appHidden: document.getElementById('appView').hidden,"
                " msg: document.getElementById('loginMsg').textContent,"
                " token: sessionStorage.getItem('admin_token')})")
    print("  401 后状态：", st)
    S.REPORT["meta"]["expired"] = json.loads(st)


S.do_401 = do_401
os.makedirs(OUT, exist_ok=True)
S.main()
