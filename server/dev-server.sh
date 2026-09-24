#!/usr/bin/env bash
# ============================================================================
# 本机开发后端的一键管理（真机三项核对 / 本地联调用）。
#
# 用法（在任意目录）：
#   bash server/dev-server.sh start    # 已在跑就不动；没跑就拉起并等 /healthz
#   bash server/dev-server.sh status   # 只看一眼在不在
#   bash server/dev-server.sh stop
#
# 为什么存在：真机开发版连的是电脑的局域网后端（miniapp/utils/env.js 的
# DEV_LAN_BASE），手机测试成败完全取决于这个进程活没活着——重启电脑后
# 手机连不上，九成是它死了，`start` 一条命令拉回来。
# 数据库密码走 application.yml 的默认值（root/123456，仅本机开发库）。
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")"

HEALTH_URL="http://localhost:9088/healthz"
LOG="/tmp/family-menu-dev-server.log"

alive() { curl -s -m 2 "$HEALTH_URL" 2>/dev/null || true; }

case "${1:-status}" in
  status)
    R="$(alive)"
    if [ -n "$R" ]; then echo "运行中：$R"; else echo "未运行（9088 无响应）"; fi
    ;;
  start)
    R="$(alive)"
    if [ -n "$R" ]; then echo "已在运行：$R"; exit 0; fi
    echo "启动中（日志 ${LOG}）"
    nohup ./mvnw -B spring-boot:run > "$LOG" 2>&1 &
    for _ in $(seq 1 30); do
      R="$(alive)"
      [ -n "$R" ] && break
      sleep 2
    done
    R="$(alive)"
    if [ -n "$R" ]; then
      echo "已就绪：$R"
      echo "局域网地址（手机用）：http://$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo '<本机IP>'):9088"
    else
      echo "启动失败，最后 20 行日志："
      tail -20 "$LOG"
      exit 1
    fi
    ;;
  stop)
    PID="$(lsof -nP -iTCP:9088 -sTCP:LISTEN -t 2>/dev/null || true)"
    if [ -n "$PID" ]; then
      kill $PID
      echo "已停止 (pid $PID)"
    else
      echo "未在运行"
    fi
    ;;
  *)
    echo "用法：bash server/dev-server.sh start|status|stop" >&2
    exit 64
    ;;
esac
