#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
话题调研：调用 last30days 引擎搜索，用 DeepSeek 生成中文简报，推送微信
用法: python3 research.py "话题"
"""
import json
import os
import re
import subprocess
import sys
import urllib.request
from datetime import datetime

BASE = "/opt/radar"
L30D_DIR = "/opt/last30days/skills/last30days/scripts"
LOG_FILE = os.path.join(BASE, "radar.log")

WECOM_KEY = os.environ.get("WECOM_KEY", "")
DEEPSEEK_KEY = os.environ.get("DEEPSEEK_API_KEY", "")


def log(msg):
    line = "[%s] %s" % (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), msg)
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def run_engine(topic, timeout=420):
    """运行 last30days 引擎，返回原始输出"""
    env = dict(os.environ)
    env["PYTHONIOENCODING"] = "utf-8"
    try:
        r = subprocess.run(
            ["python3", "last30days.py", topic],
            cwd=L30D_DIR, env=env,
            capture_output=True, text=True, timeout=timeout, errors="replace"
        )
        return (r.stdout or "") + "\n" + (r.stderr or "")
    except subprocess.TimeoutExpired:
        return ""
    except Exception as e:
        log("引擎异常: %s" % e)
        return ""


def extract_evidence(raw):
    """从原始输出提取证据块和统计"""
    # 提取 Stats 段
    stats = ""
    m = re.search(r"## Stats([\s\S]*?)(?:## Top Community Comments|## Source Coverage|<!-- END)", raw)
    if m:
        stats = m.group(1).strip()

    # 提取证据聚类（标题+URL+摘要）
    items = []
    for blk in re.finditer(
        r"###\s+\d+\.\s+([^\n]+?)\s*\(score[: ]*([\d.]+)[^)]*\)([\s\S]*?)(?=###\s+\d+\.|## Stats|$)",
        raw
    ):
        title = blk.group(1).strip()
        body = blk.group(3)
        url_m = re.search(r"URL:\s*\[?([^\]\s\)]+)", body)
        ev_m = re.search(r"Evidence:\s*>?\s*([\s\S]{20,400})", body)
        url = url_m.group(1).strip() if url_m else ""
        ev = ""
        if ev_m:
            ev = re.sub(r"\s+", " ", ev_m.group(1)).strip()[:280]
        if title:
            items.append({"title": title[:120], "url": url, "evidence": ev})

    # 提取评论
    comments = []
    for cm in re.finditer(r'-\s+"([^"]{15,200})"\s*\S*\s*([\w\-.]+) on (\w+)', raw):
        comments.append({"quote": cm.group(1)[:160], "author": cm.group(2), "src": cm.group(3)})

    # 提取源覆盖
    coverage = []
    for cm in re.finditer(r"^- (\w[\w/ ]*): (\d+) items", raw, re.M):
        coverage.append("%s %s" % (cm.group(1), cm.group(2)))

    return {"stats": stats, "items": items[:12], "comments": comments[:5], "coverage": coverage}


def ai_summarize(topic, ev):
    """用 DeepSeek 生成中文简报"""
    if not DEEPSEEK_KEY:
        return None

    payload = {
        "topic": topic,
        "stats": ev.get("stats", "")[:800],
        "items": [{"t": i["title"], "e": i["evidence"][:200]} for i in ev.get("items", [])[:10]],
        "comments": [c["quote"] for c in ev.get("comments", [])[:4]],
        "coverage": ev.get("coverage", []),
    }

    sys_p = """你是技术情报分析师。基于给定的搜索结果（来自 Hacker News 等社区的真实讨论），生成一份简洁的中文简报。

要求：
1. 开头一句话总结这个话题最近的讨论热度
2. 提炼 3-5 个关键发现，每条一句话，具体、有信息量
3. 如果发现具体的免费资源/工具/项目，单独列出（最重要）
4. 指出数据局限性（比如哪些源没数据）

严格输出 JSON：
{"summary":"一句话总览(50字内)","findings":["发现1","发现2","发现3"],"resources":[{"name":"名称","desc":"说明(40字内)","url":"链接"}],"limits":"数据局限说明(50字内)"}"""

    body = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": sys_p},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
        "temperature": 0.3,
        "max_tokens": 900,
        "response_format": {"type": "json_object"},
    }
    req = urllib.request.Request(
        "https://api.deepseek.com/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + DEEPSEEK_KEY},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            j = json.loads(r.read().decode("utf-8"))
        raw = j["choices"][0]["message"]["content"]
        try:
            return json.loads(raw)
        except Exception:
            m = re.search(r"\{[\s\S]*\}", raw)
            return json.loads(m.group(0)) if m else None
    except Exception as e:
        log("AI 总结失败: %s" % str(e)[:100])
        return None


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


def build_message(topic, ev, ai):
    now = datetime.now().strftime("%m-%d %H:%M")
    L = ["# 话题调研 · %s" % now, ""]
    L.append("**话题：%s**" % topic)
    L.append("")

    if ai:
        if ai.get("summary"):
            L.append("> %s" % ai["summary"])
            L.append("")

        findings = ai.get("findings") or []
        if findings:
            L.append("**关键发现**")
            for f in findings[:5]:
                L.append("· %s" % f)
            L.append("")

        resources = ai.get("resources") or []
        if resources:
            L.append("**可用资源**")
            for r in resources[:5]:
                name = r.get("name", "")
                desc = r.get("desc", "")
                url = r.get("url", "")
                if url:
                    L.append("[%s](%s) — %s" % (name, url, desc))
                else:
                    L.append("**%s** — %s" % (name, desc))
            L.append("")

        if ai.get("limits"):
            L.append("_%s_" % ai["limits"])
            L.append("")
    else:
        # AI 失败时用原始证据
        for i, it in enumerate(ev.get("items", [])[:6], 1):
            L.append("**%d. %s**" % (i, it["title"]))
            if it["evidence"]:
                L.append("> %s" % it["evidence"][:120])
            if it["url"]:
                L.append("> [查看](%s)" % it["url"])
            L.append("")

    if ev.get("coverage"):
        L.append("数据源：%s" % " · ".join(ev["coverage"]))

    return "\n".join(L)


def run(topic):
    log("=" * 46)
    log("调研话题: %s" % topic)

    raw = run_engine(topic)
    if not raw:
        push_wecom("# 调研失败\n\n话题：%s\n\n引擎无输出（可能超时或网络问题）" % topic)
        log("引擎无输出")
        return

    ev = extract_evidence(raw)
    log("提取到 %d 条证据，%d 条评论" % (len(ev["items"]), len(ev["comments"])))

    ai = ai_summarize(topic, ev)
    log("AI 总结: %s" % ("成功" if ai else "失败"))

    msg = build_message(topic, ev, ai)
    if not ev["items"]:
        msg = "# 话题调研\n\n话题：%s\n\n未找到相关讨论。\n\n可能是该话题过于小众，或数据源受限。" % topic

    ok = push_wecom(msg)
    # 记录推送日志
    try:
        sys.path.insert(0, BASE)
        import push_log
        push_log.record(
            kind="话题调研",
            title="调研：%s" % topic,
            content=msg,
            count=len(ev.get("items", [])),
            summary=(ai or {}).get("summary", "") or "",
            items=ev.get("items", [])[:20],
            success=ok,
        )
    except Exception as e:
        log("记录失败: %s" % e)

    if ok:
        log("✅ 已推送到微信")
    else:
        log("❌ 推送失败")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python3 research.py '话题'")
        sys.exit(1)
    run(" ".join(sys.argv[1:]))