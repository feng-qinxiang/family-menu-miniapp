#!/bin/sh
# 在 Git Bash / MSYS 下跑 Maven 的绕过脚本。
#
# 为什么需要：server/mvnw 会把 classpath 当成 POSIX 路径交给 Windows 版 java，
# 结果一启动就报 "找不到或无法加载主类 org.codehaus.plexus.classworlds.launcher.Launcher"。
# 这里自己用 cygpath 把路径转成 Windows 形式，再直接调 Launcher，等价于 mvnw 做的事。
#
# 用法（在 server/ 目录下）：
#   ../.tools/mvn.sh test
#   ../.tools/mvn.sh -q compile
#
# 前置：发行包需已下载。若本脚本提示找不到，先执行一次 ./mvnw -v 触发下载（它会报上面那个错，属正常）。
set -e

MVN_CONF=$(ls -1 "$HOME"/.m2/wrapper/dists/*/*/bin/m2.conf 2>/dev/null | head -n 1)
if [ -z "$MVN_CONF" ]; then
  echo "找不到 Maven 发行包（~/.m2/wrapper/dists/**/bin/m2.conf）。" >&2
  echo "请先在 server/ 下执行一次 ./mvnw -v 触发下载（它会在启动时报 ClassNotFoundException，属正常现象）。" >&2
  exit 1
fi

MVN_HOME=$(dirname "$(dirname "$MVN_CONF")")
CLASSWORLDS=$(ls -1 "$MVN_HOME"/boot/plexus-classworlds-*.jar 2>/dev/null | head -n 1)
if [ -z "$CLASSWORLDS" ]; then
  echo "在 $MVN_HOME/boot 下找不到 plexus-classworlds jar。" >&2
  exit 1
fi

CONF_W=$(cygpath -m "$MVN_CONF")
HOME_W=$(cygpath -m "$MVN_HOME")
JAR_W=$(cygpath -m "$CLASSWORLDS")
PROJ_W=$(cygpath -m "$(pwd)")

exec java \
  -classpath "$JAR_W" \
  -Dclassworlds.conf="$CONF_W" \
  -Dmaven.home="$HOME_W" \
  -Dmaven.multiModuleProjectDirectory="$PROJ_W" \
  org.codehaus.plexus.classworlds.launcher.Launcher "$@"
