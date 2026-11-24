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
