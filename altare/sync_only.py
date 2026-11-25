#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
同步器：把本地数据/网页/脚本提交到 GitHub 仓库
不做抓取，不重写 data.json
"""
import os
import shutil
import subprocess
import sys
from datetime import datetime

sys.path.insert(0, "/opt/radar")
from radar import log, REPO_DIR

# 需要同步的文件映射：源 -> 仓库内路径
FILES = [
    ("/opt/radar/repo/docs/data.json", "docs/data.json"),          # 已在仓库，保留
    ("/opt/radar/trending.json", "docs/trending.json"),
    ("/opt/radar/push_log.json", "docs/push_log.json"),
    ("/opt/radar/jobs.json", "docs/jobs.json"),
    ("/opt/radar/index.html", "docs/index.html"),
    # 脚本备份
    ("/opt/radar/radar.py", "altare/radar.py"),
    ("/opt/radar/schedule.py", "altare/schedule.py"),
    ("/opt/radar/github_trend.py", "altare/github_trend.py"),
    ("/opt/radar/backfill.py", "altare/backfill.py"),
    ("/opt/radar/push_log.py", "altare/push_log.py"),
    ("/opt/radar/research.py", "altare/research.py"),
    ("/opt/radar/run_all.sh", "altare/run_all.sh"),
    ("/opt/radar/sync_only.py", "altare/sync_only.py"),
]


def main():
    if not os.path.isdir(os.path.join(REPO_DIR, ".git")):
        log("[同步] 仓库不存在")
        return 1

    # 1. 复制文件
    copied = 0
    for src, rel in FILES:
        if not os.path.exists(src):
            continue
        dst = os.path.join(REPO_DIR, rel)
        # 避免自己复制自己
        if os.path.abspath(src) == os.path.abspath(dst):
            continue
        try:
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(src, dst)
            copied += 1
        except Exception as e:
            log("  复制失败 %s: %s" % (rel, e))
    log("[同步] 已复制 %d 个文件" % copied)

    # 2. git 提交
    env = dict(os.environ)
    env["GIT_SSH_COMMAND"] = "ssh -i /opt/radar/deploy_key -o StrictHostKeyChecking=accept-new"

    def sh(cmd, timeout=120):
        return subprocess.run(cmd, shell=True, cwd=REPO_DIR, env=env,
                              capture_output=True, text=True, timeout=timeout)

    sh("git config user.name 'altare-radar-bot'")
    sh("git config user.email 'bot@users.noreply.github.com'")
    sh("git add -A")

    r = sh("git diff --staged --quiet")
    if r.returncode == 0:
        log("[同步] 无变更")
        return 0

    msg = "update: %s" % datetime.now().strftime("%Y-%m-%d %H:%M")
    r = sh('git commit -m "%s"' % msg)
    if r.returncode != 0:
        log("[同步] commit 失败: %s" % (r.stderr or "")[:150])
        return 1

    r = sh("git push origin main", timeout=90)
    if r.returncode != 0:
        log("[同步] push 失败: %s" % (r.stderr or "")[:150])
        return 1

    log("[同步] ✅ 已推送")
    return 0


if __name__ == "__main__":
    sys.exit(main())
