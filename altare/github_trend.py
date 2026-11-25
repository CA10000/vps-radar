#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GitHub 热点专区
抓取 Trending（日/周/多语言）-> 按热度排序 -> 独立存储 -> 微信推送 + 网页展示
"""
import json
import os
import re
import sys
import html as html_mod
import time
import urllib.request
from datetime import datetime, timezone

BASE = "/opt/radar"
TREND_FILE = os.path.join(BASE, "trending.json")
LOG_FILE = os.path.join(BASE, "radar.log")

WECOM_KEY = os.environ.get("WECOM_KEY", "")

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# Trending 抓取目标：(标识, 显示名, URL)
TREND_URLS = [
    ("daily", "今日全站", "https://github.com/trending?since=daily"),
    ("weekly", "本周全站", "https://github.com/trending?since=weekly"),
    ("daily_py", "今日Python", "https://github.com/trending/python?since=daily"),
    ("daily_js", "今日JS", "https://github.com/trending/javascript?since=daily"),
    ("daily_ts", "今日TS", "https://github.com/trending/typescript?since=daily"),
]


def log(msg):
    line = "[%s] %s" % (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), msg)
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def http_get(url, timeout=30):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode("utf-8", errors="ignore")
    except Exception as e:
        log("  抓取失败 %s: %s" % (url, str(e)[:60]))
        return None


def parse_num(s):
    """解析 '1,234' -> 1234"""
    if not s:
        return 0
    digits = re.sub(r"[^\d]", "", s)
    return int(digits) if digits else 0


def parse_trending(html_text, label):
    """解析 Trending 页面"""
    out = []
    if not html_text:
        return out

    arts = re.findall(r'<article[^>]*class="[^"]*Box-row[^"]*"[^>]*>([\s\S]*?)</article>', html_text)

    for a in arts:
        # 仓库全名
        m = re.search(r'<h2[^>]*>[\s\S]*?href="/([^"/]+/[^"/]+)"', a)
        if not m:
            continue
        repo = m.group(1)

        # 描述
        d = re.search(r'<p[^>]*class="[^"]*col-9[^"]*"[^>]*>([\s\S]*?)</p>', a)
        desc = ""
        if d:
            desc = re.sub(r"<[^>]+>", "", d.group(1))
            desc = html_mod.unescape(re.sub(r"\s+", " ", desc)).strip()

        # 总 stars
        s = re.search(r'href="/' + re.escape(repo) + r'/stargazers"[^>]*>([\s\S]*?)</a>', a)
        stars = parse_num(re.sub(r"<[^>]+>|\s", "", s.group(1))) if s else 0

        # 今日/本周新增
        today_match = re.search(r"([\d,]+)\s*stars\s+(today|this week)", re.sub(r"<[^>]+>", " ", a))
        growth = parse_num(today_match.group(1)) if today_match else 0

        # 语言
        l = re.search(r'itemprop="programmingLanguage">([^<]+)<', a)
        lang = l.group(1) if l else ""

        out.append({
            "repo": repo,
            "url": "https://github.com/" + repo,
            "desc": desc[:300],
            "stars": stars,
            "growth": growth,
            "lang": lang,
            "list": label,
        })
    return out


def fetch_all():
    """抓取所有 Trending 列表，合并去重"""
    seen = {}
    for key, label, url in TREND_URLS:
        html_text = http_get(url)
        items = parse_trending(html_text, label)
        log("  %-12s %2d 个项目" % (label, len(items)))
        for it in items:
            repo = it["repo"]
            if repo in seen:
                # 已存在：保留最大增长值，并记录出现在多个榜单
                old = seen[repo]
                old["growth"] = max(old["growth"], it["growth"])
                if label not in old["lists"]:
                    old["lists"].append(label)
            else:
                it["lists"] = [label]
                seen[repo] = it
        time.sleep(0.8)

    # 按今日增长排序
    result = sorted(seen.values(), key=lambda x: (x["growth"], x["stars"]), reverse=True)
    return result


def load_history():
    try:
        with open(TREND_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"snapshots": [], "repos": {}}


def save_history(data):
    try:
        with open(TREND_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
    except Exception as e:
        log("保存失败: %s" % e)


def push_wecom(md):
    if not WECOM_KEY:
        return False
    body = {"msgtype": "markdown", "markdown": {"content": md[:4000]}}
    req = urllib.request.Request(
        "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=" + WECOM_KEY,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            j = json.loads(r.read().decode("utf-8"))
        return j.get("errcode") == 0
    except Exception as e:
        log("推送异常: %s" % str(e)[:80])
        return False


def build_message(hot):
    now = datetime.now().strftime("%m-%d %H:%M")
    lines = ["# 🔥 GitHub 热点 · %s" % now, ""]
    lines.append("**今日最热 %d 个项目**" % len(hot))
    lines.append("")

    for i, it in enumerate(hot[:10], 1):
        lines.append("**%d. [%s](%s)**" % (i, it["repo"], it["url"]))
        lines.append("> ⭐%s 总计 · **+%s 今日**%s" % (
            "{:,}".format(it["stars"]), it["growth"],
            " · " + it["lang"] if it["lang"] else ""))
        if it["desc"]:
            lines.append("> %s" % it["desc"][:100])
        lines.append("")

    return "\n".join(lines)


def run():
    log("=" * 46)
    log("GitHub 热点抓取")

    items = fetch_all()
    if not items:
        log("未抓到任何项目")
        return

    log("去重后 %d 个项目" % len(items))

    # 热度门槛：今日新增 >= 50
    hot = [i for i in items if i["growth"] >= 50]
    log("热点项目（增长>=50）: %d 个" % len(hot))

    # 保存历史
    hist = load_history()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    snapshot = {
        "date": today,
        "at": datetime.now(timezone.utc).isoformat(),
        "items": [{"repo": i["repo"], "stars": i["stars"], "growth": i["growth"]} for i in hot],
    }
    hist["snapshots"] = [s for s in hist.get("snapshots", []) if s.get("date") != today]
    hist["snapshots"].insert(0, snapshot)
    hist["snapshots"] = hist["snapshots"][:30]  # 保留 30 天

    # 更新每个 repo 的最新信息
    repos = hist.get("repos", {})
    for it in items:
        repos[it["repo"]] = {
            "repo": it["repo"],
            "url": it["url"],
            "desc": it["desc"],
            "stars": it["stars"],
            "growth": it["growth"],
            "lang": it["lang"],
            "lastSeen": today,
        }
    # 只保留最近出现过的（防止无限膨胀）
    hist["repos"] = repos
    hist["lastUpdate"] = datetime.now(timezone.utc).isoformat()

    save_history(hist)
    log("已保存 %d 天历史，%d 个仓库" % (len(hist["snapshots"]), len(repos)))

    # 推送并记录
    if hot:
        msg = build_message(hot)
        ok = push_wecom(msg)
        # 记录到推送日志
        try:
            sys.path.insert(0, BASE)
            import push_log
            push_log.record(
                kind="GitHub热点",
                title="GitHub 热点 · %d 个" % len(hot),
                content=msg,
                count=len(hot),
                summary="今日最热：%s" % hot[0]["repo"] if hot else "",
                items=[{
                    "title": h["repo"],
                    "url": h["url"],
                    "desc": h["desc"][:120],
                    "stars": h["stars"],
                    "growth": h["growth"],
                    "lang": h["lang"],
                } for h in hot[:30]],
                success=ok,
            )
        except Exception as e:
            log("记录失败: %s" % e)

        if ok:
            log("✅ 微信推送成功：%d 个热点" % len(hot))
        else:
            log("❌ 微信推送失败")
    else:
        log("今日无达到门槛的热点")


if __name__ == "__main__":
    run()
