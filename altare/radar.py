#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VPS 雷达 · Altare 推送版 v2
新增：GitHub 高质量源（AI/大模型/免费资源/羊毛）
只用标准库，无需 pip
"""
import json
import os
import re
import sys
import time
import html
import subprocess
import urllib.request
import urllib.error
from datetime import datetime, timezone

BASE = "/opt/radar"
STATE_FILE = os.path.join(BASE, "state.json")
LOG_FILE = os.path.join(BASE, "radar.log")
GH_CACHE = os.path.join(BASE, "gh_cache.json")

WECOM_KEY = os.environ.get("WECOM_KEY", "")
DEEPSEEK_KEY = os.environ.get("DEEPSEEK_API_KEY", "")

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# ───────── 数据源 ─────────
# 格式: (id, 名称, 分类, 类型, 地址, 附加参数)
SOURCES = [
    # A 类：低价 VPS / 服务器
    ("lowendtalk", "LowEndTalk", "A", "rss", "https://lowendtalk.com/categories/offers/feed.rss", None),
    ("lowendbox", "LowEndBox", "A", "rss", "https://lowendbox.com/feed/", None),
    ("nodeseek", "NodeSeek", "A", "rss", "https://www.nodeseek.com/rss.xml", None),
    ("lowendspirit", "LowEndSpirit", "A", "rss", "https://lowendspirit.com/discussions/feed.rss", None),
    ("v2ex", "V2EX", "A", "rss", "https://www.v2ex.com/feed/tab/tech.xml", None),

    # B 类：官方免费层 + 免费资源大全
    ("free-for-dev", "free-for-dev", "B", "md",
     "https://raw.githubusercontent.com/ripienaar/free-for-dev/master/README.md",
     ["Major Cloud Providers", "IaaS", "PaaS", "Web Hosting"]),
    ("public-apis", "public-apis", "B", "md_table",
     "https://raw.githubusercontent.com/public-apis/public-apis/master/README.md",
     ["Development", "Machine Learning", "Cloud Storage & File Sharing"]),

    # C 类：AI / 大模型 / 技术资讯
    # 注意：GitHub 未认证 Search API 每小时仅 10 次，只保留 2 个搜索源
    ("gh-llm-popular", "GitHub·热门LLM", "C", "gh_search",
     "llm+stars:>1000", "stars"),
    ("gh-free-ai", "GitHub·免费AI", "C", "gh_search",
     "free+ai+in:description+stars:>500", "updated"),
    ("hn-ai", "HN·AI", "C", "hn",
     "https://hn.algolia.com/api/v1/search_by_date?query=AI%20model&tags=story&hitsPerPage=25", None),
    ("hn-free", "HN·free tier", "C", "hn",
     "https://hn.algolia.com/api/v1/search_by_date?query=free%20api%20service&tags=story&hitsPerPage=20", None),
    ("lobsters", "Lobsters", "C", "rss", "https://lobste.rs/rss", None),
    ("devto-ai", "DEV.to·AI", "C", "rss", "https://dev.to/feed/tag/ai", None),
]

FREE_STRONG = re.compile(
    r"免费|白嫖|永久免费|零成本|不收费|免费领|免费送|免费试用|免费额度|免费api|"
    r"free\s*tier|always\s*free|no\s*cost|for\s*free|free\s*api|giveaway|open\s*source|"
    r"awesome",
    re.I)
NOT_FREE = re.compile(
    r"[\[【]\s*(出|收|求|售|租)\s*[\]】]|溢价|剩余价值|带价|私信|收一个|出一个|求一个|出租|转让|"
    r"批量出|成品号|信用卡注册|接码|养号|跑路", re.I)

AI_KEYWORDS = re.compile(
    r"\bllm\b|\bgpt\b|\bclaude\b|\bgemini\b|\bllama\b|\bmistral\b|\bdeepseek\b|\bqwen\b|"
    r"大模型|人工智能|\bai\b|\bagent\b|\brag\b|embedding|fine-?tun|inference|推理",
    re.I)


def log(msg):
    line = "[%s] %s" % (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), msg)
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def http_get(url, timeout=25, headers=None):
    h = {"User-Agent": UA, "Accept": "*/*",
         "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            try:
                return raw.decode("utf-8")
            except UnicodeDecodeError:
                return raw.decode("gbk", errors="ignore")
    except urllib.error.HTTPError as e:
        return None
    except Exception:
        return None


def strip_tags(s):
    s = re.sub(r"<!\[CDATA\[|\]\]>", "", s or "")
    s = re.sub(r"<script[\s\S]*?</script>", " ", s, flags=re.I)
    s = re.sub(r"<style[\s\S]*?</style>", " ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s)
    s = re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", s)
    s = re.sub(r"\[[0-9]{1,2}m", "", s)
    s = re.sub(r"\+{3,}", "", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def parse_rss(text):
    """同时支持 RSS(<item>) 和 Atom(<entry>)"""
    out = []
    blocks = re.findall(r"<item>([\s\S]*?)</item>", text)
    if not blocks:
        blocks = re.findall(r"<entry>([\s\S]*?)</entry>", text)
    for b in blocks:
        t = re.search(r"<title[^>]*>([\s\S]*?)</title>", b)
        # Atom 的 link 是属性形式
        l = re.search(r"<link>([\s\S]*?)</link>", b) or \
            re.search(r'<link[^>]*href="([^"]+)"', b)
        desc = re.search(r"<description>([\s\S]*?)</description>", b) or \
               re.search(r"<summary[^>]*>([\s\S]*?)</summary>", b) or \
               re.search(r"<content[^>]*>([\s\S]*?)</content>", b)
        if not t or not l:
            continue
        title = strip_tags(t.group(1))
        link = strip_tags(l.group(1))
        if not title or not link.startswith("http"):
            continue
        out.append({"title": title[:200], "url": link,
                    "summary": strip_tags(desc.group(1))[:400] if desc else ""})
    return out


def parse_hn(text):
    try:
        j = json.loads(text)
    except Exception:
        return []
    return [{"title": (h.get("title") or "")[:200],
             "url": h.get("url") or "https://news.ycombinator.com/item?id=" + h.get("objectID", ""),
             "summary": "HN %s 分 %s 评论" % (h.get("points", 0), h.get("num_comments", 0))}
            for h in j.get("hits", []) if h.get("title")]


def parse_md(text, sections):
    out = []
    if sections:
        parts = re.split(r"^##\s+", text, flags=re.M)
        chunks = [p for p in parts
                  if any(s.lower() in p.split("\n")[0].strip().lower() for s in sections)]
    else:
        chunks = [text]
    for p in chunks:
        for line in p.split("\n"):
            m = re.match(r"^\s*[-*]\s+\[([^\]]+)\]\((https?://[^)\s]+)\)\s*(?:[-–—:]\s*)?(.*)$", line)
            if not m:
                continue
            out.append({"title": m.group(1)[:200], "url": m.group(2),
                        "summary": strip_tags(m.group(3))[:300]})
    return out


def parse_md_table(text, sections):
    """解析 Markdown 表格格式（public-apis 那种）
    格式: | [名字](url) | 描述 | 认证 | HTTPS | CORS |
    """
    out = []
    parts = re.split(r"^###\s+", text, flags=re.M)
    for p in parts:
        head = p.split("\n")[0].strip()
        if not any(s.lower() in head.lower() for s in sections):
            continue
        for line in p.split("\n"):
            # 表格行：| [title](url) | desc | auth | ... |
            m = re.match(r"^\s*\|\s*\[([^\]]+)\]\((https?://[^)\s]+)\)\s*\|([^|]*)\|", line)
            if not m:
                continue
            title, url, desc = m.group(1), m.group(2), m.group(3).strip()
            # 只保留免费无需 key 的
            cols = [c.strip() for c in line.split("|")]
            auth = cols[3] if len(cols) > 3 else ""
            if auth and auth not in ("No", "", "`OAuth`") and "apiKey" not in auth:
                pass
            out.append({
                "title": title[:200],
                "url": url,
                "summary": ("[%s] %s" % (head, strip_tags(desc)))[:300],
            })
    return out


def parse_gh(text):
    """GitHub Search API 结果"""
    try:
        j = json.loads(text)
    except Exception:
        return []
    if not j.get("items"):
        return []
    out = []
    for it in j["items"]:
        stars = it.get("stargazers_count", 0)
        desc = it.get("description") or "(无描述)"
        # 过滤低星
        if stars < 100:
            continue
        out.append({
            "title": "%s ⭐%s" % (it.get("full_name", ""), stars),
            "url": it.get("html_url", ""),
            "summary": desc[:300],
            "stars": stars,
            "lang": it.get("language") or "",
        })
    return out


def gh_api(url, cache_key):
    """带缓存的 GitHub API 调用（未认证 10 次/小时，缓存 6 小时）"""
    cache = load_json(GH_CACHE, {})
    now = time.time()
    # 缓存 6 小时，远大于运行间隔
    if cache_key in cache and now - cache[cache_key].get("t", 0) < 21600:
        return cache[cache_key].get("d", "")

    text = http_get(url, timeout=25, headers={
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    })
    if text and '"items"' in text:
        cache[cache_key] = {"t": now, "d": text}
        save_json(GH_CACHE, cache)
        return text
    # 失败：返回过期缓存（降级）
    if cache_key in cache:
        log("  GitHub API 失败，使用旧缓存")
        return cache[cache_key].get("d", "")
    return ""


def load_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def save_json(path, data):
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
    except Exception as e:
        log("保存失败 %s: %s" % (path, e))


def fetch_source(sid, name, cat, kind, url, extra):
    if kind == "gh_search":
        q, sort = url, extra
        api = ("https://api.github.com/search/repositories?q=%s&sort=%s&order=desc&per_page=15"
               % (q, sort))
        text = gh_api(api, "%s_%s" % (sid, datetime.now().strftime("%Y%m%d%H")))
        items = parse_gh(text) if text else []
    else:
        text = http_get(url)
        if not text:
            return []
        if kind == "rss":
            items = parse_rss(text)
        elif kind == "hn":
            items = parse_hn(text)
        elif kind == "md":
            items = parse_md(text, extra)
        elif kind == "md_table":
            items = parse_md_table(text, extra)
        else:
            items = []

    for it in items:
        it["source"] = name
        it["source_id"] = sid
        it["cat"] = cat
    return items


def item_hash(it):
    u = re.sub(r"[?&](utm_|ref|fbclid|gclid|from)[^&]*", "", it["url"])
    return "%s|%s" % (it["source_id"], u)


# ───────── AI 审核 ─────────
SYS_PROMPT = """你是"免费资源"审核员。判断这条信息对开发者是否有价值。

三类内容都算有价值：
1. 免费服务器/云资源（VPS、PaaS、免费层、沙盒）
2. 免费的 AI/大模型 API 或工具（免费额度、开源模型、免费服务）
3. 高价值开源项目（有实际用途，不是玩具、不是教程合集、不是营销仓库）

判定 is_free=true 的条件（满足任一）：
- 提供免费可用的服务器/云资源
- 提供免费 AI/LLM 额度或开源模型/工具
- 是高星开源项目且能用（stars > 500）

判定 is_free=false：
- 需要付费（含低价促销 $X/月）
- 二手交易、转卖、求购
- 蹭额度的 hack（GitHub Actions 伪装 VPS）
- 纯教程、纯新闻、无实际可用产品
- 营销推广、引流仓库

输出严格 JSON：
{"is_free":true/false,"is_server":true/false,"confidence":0-100,"real_free":"是什么/免费什么(60字内)","risks":"风险(40字内，无则填无)","kind":"免费服务器/免费AI/开源项目/其他"}"""


def ai_review(it):
    if not DEEPSEEK_KEY:
        return None
    body = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": SYS_PROMPT},
            {"role": "user", "content": "标题：%s\n来源：%s\n摘要：%s\n链接：%s" % (
                it["title"], it["source"], it.get("summary", "")[:300], it["url"])},
        ],
        "temperature": 0.1,
        "max_tokens": 300,
        "response_format": {"type": "json_object"},
    }
    req = urllib.request.Request(
        "https://api.deepseek.com/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + DEEPSEEK_KEY},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            j = json.loads(r.read().decode("utf-8"))
        raw = j["choices"][0]["message"]["content"]
        try:
            return json.loads(raw)
        except Exception:
            m = re.search(r"\{[\s\S]*\}", raw)
            return json.loads(m.group(0)) if m else None
    except Exception as e:
        log("AI 失败: %s" % str(e)[:80])
        return None


# ───────── 推送 ─────────
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


KIND_EMOJI = {"免费服务器": "🖥", "免费AI": "🤖", "开源项目": "⭐", "其他": "📌"}


def build_message(items):
    now = datetime.now().strftime("%m-%d %H:%M")
    lines = ["# 📡 每日情报 · %s" % now, ""]
    lines.append("**共 %d 条有价值内容**" % len(items))
    lines.append("")

    # 按类型分组
    groups = {}
    for it in items:
        k = it["ai"].get("kind", "其他")
        groups.setdefault(k, []).append(it)

    order = ["免费服务器", "免费AI", "开源项目", "其他"]
    for k in order:
        if k not in groups:
            continue
        emoji = KIND_EMOJI.get(k, "📌")
        lines.append("## %s %s（%d）" % (emoji, k, len(groups[k])))
        for it in groups[k][:6]:
            title = it["title"][:55]
            lines.append("**[%s](%s)**" % (title, it["url"]))
            rf = it["ai"].get("real_free", "")[:90]
            if rf:
                lines.append("> %s" % rf)
            risk = it["ai"].get("risks", "")
            if risk and risk != "无":
                lines.append("> ⚠️ %s" % risk[:70])
            lines.append("")

    return "\n".join(lines)


# ───────── GitHub 同步 ─────────
REPO_DIR = "/opt/radar/repo"


def backup_scripts():
    """把核心脚本备份到仓库（防 Altare 清档丢失）"""
    backup_dir = os.path.join(REPO_DIR, "altare")
    try:
        os.makedirs(backup_dir, exist_ok=True)
        files = {
            "/opt/radar/radar.py": "radar.py",
            "/opt/radar/schedule.py": "schedule.py",
            "/opt/radar/run.sh": "run.sh",
            "/opt/radar/start.sh": "start.sh",
        }
        n = 0
        for src, dst in files.items():
            if os.path.exists(src):
                with open(src, "rb") as f:
                    content = f.read()
                with open(os.path.join(backup_dir, dst), "wb") as f:
                    f.write(content)
                n += 1
        # 写一份恢复说明
        readme = """# Altare 部署备份

这是自动备份的核心脚本，用于服务器重置后快速恢复。

## 恢复步骤

```bash
# 1. 在新服务器上
mkdir -p /opt/radar
cd /opt/radar

# 2. 拉取备份
git clone https://github.com/CA10000/vps-radar.git repo
cp repo/altare/*.py repo/altare/*.sh /opt/radar/
chmod +x /opt/radar/*.sh

# 3. 配置环境变量
cat > /opt/radar/.env << 'ENVEOF'
WECOM_KEY=你的企业微信key
DEEPSEEK_API_KEY=你的deepseek key
ENVEOF
chmod 600 /opt/radar/.env

# 4. 生成新的 deploy key 并添加到 GitHub
ssh-keygen -t ed25519 -f /opt/radar/deploy_key -N ''
cat /opt/radar/deploy_key.pub
# 把公钥粘贴到仓库 Settings -> Deploy keys，勾选 Allow write access

# 5. 配置 git
cat > /root/.ssh/config << 'SSHEOF'
Host github.com
  HostName github.com
  User git
  IdentityFile /opt/radar/deploy_key
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
SSHEOF
chmod 600 /root/.ssh/config

# 6. 启动
/opt/radar/start.sh
```

最后更新时间：见 git 提交记录
"""
        with open(os.path.join(backup_dir, "README.md"), "w", encoding="utf-8") as f:
            f.write(readme)
        return n
    except Exception as e:
        log("  [备份] 失败: %s" % e)
        return 0


def sync_to_github(all_items, valuable):
    """把数据写入仓库并 push（供 GitHub Pages 使用）"""
    if not os.path.isdir(os.path.join(REPO_DIR, ".git")):
        log("  [GitHub] 仓库未初始化，跳过同步")
        return False

    # 备份脚本
    nb = backup_scripts()
    if nb:
        log("  [备份] 已备份 %d 个脚本到 altare/" % nb)

    now = datetime.now(timezone.utc).isoformat()

    # 转换成网页需要的格式
    web_items = []
    for it in all_items:
        ai = it.get("ai")
        web_items.append({
            "hash": item_hash(it),
            "source_id": it.get("source_id", ""),
            "source_name": it.get("source", ""),
            "category": it.get("cat", "C"),
            "title": it.get("title", ""),
            "url": it.get("url", ""),
            "summary": it.get("summary", ""),
            "published_at": None,
            "found_at": now,
            "ai": None if not ai else {
                "is_server": ai.get("is_server", False),
                "is_free": ai.get("is_free", False),
                "confidence": ai.get("confidence", 0),
                "real_free": ai.get("real_free", ""),
                "cost": "",
                "risks": ai.get("risks", ""),
                "tag": ai.get("kind", ""),
            },
        })

    # 读取已有数据，合并去重
    data_file = os.path.join(REPO_DIR, "docs", "data.json")
    old_items = []
    if os.path.exists(data_file):
        try:
            with open(data_file, "r", encoding="utf-8") as f:
                old = json.load(f)
                old_items = old.get("items", [])
        except Exception:
            pass

    seen = set()
    merged = []
    for it in web_items + old_items:
        h = it.get("hash")
        if not h or h in seen:
            continue
        seen.add(h)
        merged.append(it)

    merged = merged[:5000]

    payload = {
        "items": merged,
        "lastUpdate": now,
        "source": "altare",
    }

    try:
        os.makedirs(os.path.join(REPO_DIR, "docs"), exist_ok=True)
        with open(data_file, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
    except Exception as e:
        log("  [GitHub] 写文件失败: %s" % e)
        return False

    # 同时写一份到 gh-action/docs（保持旧结构兼容）
    try:
        alt = os.path.join(REPO_DIR, "gh-action", "docs")
        os.makedirs(alt, exist_ok=True)
        with open(os.path.join(alt, "data.json"), "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
    except Exception:
        pass

    # 同步 GitHub 热点数据
    trend_src = "/opt/radar/trending.json"
    if os.path.exists(trend_src):
        try:
            import shutil
            shutil.copy(trend_src, os.path.join(REPO_DIR, "docs", "trending.json"))
            log("  [GitHub] 已同步 trending.json")
        except Exception as e:
            log("  [GitHub] trending 同步失败: %s" % e)

    # 同步新版网页（如果存在）
    new_ui = "/opt/radar/index.html"
    if os.path.exists(new_ui):
        try:
            import shutil
            shutil.copy(new_ui, os.path.join(REPO_DIR, "docs", "index.html"))
            log("  [GitHub] 已同步 index.html")
        except Exception as e:
            log("  [GitHub] index 同步失败: %s" % e)

    # git 操作
    env = dict(os.environ)
    env["GIT_SSH_COMMAND"] = "ssh -i /opt/radar/deploy_key -o StrictHostKeyChecking=accept-new"

    def sh(cmd):
        return subprocess.run(cmd, shell=True, cwd=REPO_DIR, env=env,
                              capture_output=True, text=True, timeout=120)

    r = sh("git add -A")
    if r.returncode != 0:
        log("  [GitHub] git add 失败: %s" % (r.stderr or "")[:100])
        return False

    # 检查是否有变更
    r = sh("git diff --staged --quiet")
    if r.returncode == 0:
        log("  [GitHub] 无变更，跳过提交")
        return True

    msg = "data: %s (%d 条)" % (datetime.now().strftime("%Y-%m-%d %H:%M"), len(merged))
    r = sh('git commit -m "%s"' % msg)
    if r.returncode != 0:
        log("  [GitHub] commit 失败: %s" % (r.stderr or "")[:100])
        return False

    r = sh("git push origin main")
    if r.returncode != 0:
        log("  [GitHub] push 失败: %s" % (r.stderr or "")[:150])
        return False

    log("  [GitHub] ✅ 已推送 %d 条到仓库" % len(merged))
    return True


# ───────── 心跳 ─────────
HEARTBEAT = "/opt/radar/heartbeat.txt"


def check_heartbeat():
    """检查上次成功运行时间，返回异常提示"""
    try:
        with open(HEARTBEAT, "r") as f:
            last = datetime.fromisoformat(f.read().strip())
        gap = (datetime.now(timezone.utc) - last).total_seconds() / 3600
        if gap > 26:  # 超过 26 小时说明漏了至少一次
            return "⚠️ 上次运行在 %.0f 小时前（可能中断过）" % gap
    except Exception:
        pass
    return None


def write_heartbeat():
    try:
        with open(HEARTBEAT, "w") as f:
            f.write(datetime.now(timezone.utc).isoformat())
    except Exception:
        pass


# ───────── 主流程 ─────────
def run():
    log("=" * 46)
    log("开始抓取 v2")

    state = load_json(STATE_FILE, {"seen": [], "pushed": []})
    seen = set(state.get("seen", []))
    pushed = set(state.get("pushed", []))

    all_items = []
    for sid, name, cat, kind, url, extra in SOURCES:
        items = fetch_source(sid, name, cat, kind, url, extra)
        log("  %-20s %3d 条" % (name, len(items)))
        all_items.extend(items)
        time.sleep(0.5)

    # 去重
    fresh = []
    for it in all_items:
        h = item_hash(it)
        if h in seen:
            continue
        if NOT_FREE.search(it["title"]):
            continue
        fresh.append((h, it))
        seen.add(h)

    log("新增 %d 条（抓取 %d 条）" % (len(fresh), len(all_items)))

    # 粗筛
    candidates = []
    for h, it in fresh:
        text = it["title"] + " " + it.get("summary", "")
        if FREE_STRONG.search(text) or AI_KEYWORDS.search(text):
            candidates.append((h, it))
        elif it.get("stars", 0) >= 1000:  # 高星项目直接进
            candidates.append((h, it))

    log("粗筛 %d 条进入 AI 审核" % len(candidates))

    # AI 审核（每轮最多 50 条，一天 2 轮 ≈ 100 条/天，成本约 ¥0.02/天）
    valuable = []
    for h, it in candidates[:50]:
        r = ai_review(it)
        if not r:
            continue
        it["ai"] = r
        conf = r.get("confidence", 0)
        if r.get("is_free") and conf >= 65 and h not in pushed:
            valuable.append(it)
            pushed.add(h)
            log("  ✅ [%s] %s" % (r.get("kind", "?"), it["title"][:50]))
        time.sleep(0.35)

    # 推送微信
    health = check_heartbeat()
    if health:
        log("  " + health)

    if valuable:
        msg = build_message(valuable)
        if health:
            msg += "\n\n" + health
        if push_wecom(msg):
            log("✅ 微信推送成功：%d 条" % len(valuable))
        else:
            log("❌ 微信推送失败")
    else:
        log("本轮无新内容（微信不推送）")
        # 若长时间无推送，发一次存活确认
        if health:
            push_wecom("# 📡 VPS 雷达运行中\n\n本轮无新内容。\n\n" + health)

    # 同步到 GitHub（网页）
    log("同步到 GitHub...")
    sync_to_github([it for _, it in fresh] + [it for _, it in candidates], valuable)

    state["seen"] = list(seen)
    state["pushed"] = list(pushed)
    state["last_run"] = datetime.now(timezone.utc).isoformat()
    save_json(STATE_FILE, state)
    write_heartbeat()
    log("完成")


if __name__ == "__main__":
    run()
