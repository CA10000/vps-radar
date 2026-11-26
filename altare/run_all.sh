#!/bin/bash
# 完整运行：GitHub热点 + 免费资源雷达
cd /opt/radar
set -a
. /opt/radar/.env
set +a
export WECOM_KEY DEEPSEEK_API_KEY

echo "════════ $(TZ='Asia/Shanghai' date '+%Y-%m-%d %H:%M') BJ ════════"

echo "--- [1/3] GitHub 热点 ---"
timeout 300 python3 /opt/radar/github_trend.py 2>&1 | tail -8

echo "--- [2/4] 免费资源抓取+审核 ---"
timeout 900 python3 /opt/radar/radar.py 2>&1 | tail -8

echo "--- [3/4] 海外远程职位 ---"
timeout 400 python3 /opt/radar/jobs.py 2>&1 | tail -6

echo "--- [4/4] 同步到 GitHub ---"
timeout 180 python3 /opt/radar/sync_only.py 2>&1 | tail -6

echo "--- [5/5] SEUS 积分维护 ---"
timeout 120 /opt/seus/daily.sh 2>&1 | tail -4

echo "════════ 完成 ════════"
