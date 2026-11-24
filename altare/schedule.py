#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
定时调度器：每天只在指定时间运行（默认北京时间 08:00 和 20:00）
服务器时区是 UTC，北京时间 = UTC+8
"""
import os
import subprocess
import sys
import time
from datetime import datetime, timezone, timedelta

BASE = "/opt/radar"
LOG = os.path.join(BASE, "daemon.log")

# 北京时间运行时刻（小时）
RUN_HOURS_BJ = [8, 20]
BJ_TZ = timezone(timedelta(hours=8))


def log(msg):
    line = "[%s] %s" % (datetime.now(BJ_TZ).strftime("%Y-%m-%d %H:%M:%S BJ"), msg)
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def seconds_until_next():
    """计算距离下一个运行时刻的秒数"""
    now_j = datetime.now(BJ_TZ)
    today = now_j.replace(hour=0, minute=0, second=0, microsecond=0)

    # 今天的候选时间点
    candidates = []
    for h in RUN_HOURS_BJ:
        t = today + timedelta(hours=h)
        candidates.append(t)
    # 明天的第一个
    candidates.append(today + timedelta(days=1, hours=RUN_HOURS_BJ[0]))

    # 找下一个未来时刻（留 60 秒缓冲，避免刚跑完又跑）
    for t in candidates:
        if (t - now_j).total_seconds() > 60:
            return (t - now_j).total_seconds(), t

    # 兜底
    nxt = today + timedelta(days=1, hours=RUN_HOURS_BJ[0])
    return (nxt - now_j).total_seconds(), nxt


def main():
    log("调度器启动")
    log("运行时刻（北京）: %s" % ", ".join("%02d:00" % h for h in RUN_HOURS_BJ))

    # 启动时立即跑一次（可选，首次部署用）
    if "--run-now" in sys.argv:
        log("首次运行")
        run_once()

    while True:
        wait, nxt = seconds_until_next()
        log("下次运行: %s（还有 %.0f 分钟）" % (
            nxt.strftime("%Y-%m-%d %H:%M BJ"), wait / 60))
        time.sleep(wait)
        run_once()
        # 跑完等 2 分钟再算下次，避免重复触发
        time.sleep(120)


def run_once():
    log("-" * 40)
    log("开始执行")
    t0 = time.time()
    try:
        r = subprocess.run(
            ["/bin/bash", "/opt/radar/run.sh"],
            capture_output=True, text=True, timeout=1800
        )
        out = (r.stdout or "") + (r.stderr or "")
        # 只记录关键行
        for line in out.split("\n"):
            if any(k in line for k in ["推送", "新增", "粗筛", "✅", "❌", "完成", "错误"]):
                log("  " + line.strip())
        log("执行完成，耗时 %.0f 秒" % (time.time() - t0))
    except subprocess.TimeoutExpired:
        log("执行超时")
    except Exception as e:
        log("执行异常: %s" % e)


if __name__ == "__main__":
    main()
