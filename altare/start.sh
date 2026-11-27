#!/bin/bash
cd /opt/radar
# 防止重复启动
if [ -f /opt/radar/schedule.pid ]; then
  OLD=$(cat /opt/radar/schedule.pid)
  if kill -0 "$OLD" 2>/dev/null; then
    echo "调度器已在运行 (PID $OLD)"
    exit 0
  fi
fi
setsid nohup python3 /opt/radar/schedule.py >> /opt/radar/daemon.log 2>&1 &
echo $! > /opt/radar/schedule.pid
echo "调度器已启动 PID $(cat /opt/radar/schedule.pid)"

# ---- 公网节点（Cloudflare Tunnel + 展示页）----
if ! ps -eo args | grep -q "[w]ebsup2.sh"; then
  setsid nohup /opt/radar/websup2.sh > /opt/radar/websup.log 2>&1 < /dev/null &
  echo "公网节点守护已启动"
fi


# ---- free-hunter 抢号（通用）----
if ! pgrep -f 'freehunter/scripts/grab\.py' > /dev/null 2>&1; then
  cd /opt/freehunter && setsid nohup python3 /opt/freehunter/scripts/grab.py /opt/freehunter/hoody/config.json >> /opt/freehunter/hoody/grab.log 2>&1 < /dev/null &
  echo "free-hunter 抢号已启动"
fi

