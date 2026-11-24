// 各类源的抓取与解析逻辑
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function stripHtml(s = "") {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    // 清理 ANSI 转义序列与控制字符（NodeSeek 测评帖常见）
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
    .replace(/\[[0-9]{1,2}m/g, "")
    .replace(/\[[HJ]/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/\+{3,}/g, "")          // 清掉测评报告里的 +++ 分隔线
    .replace(/\s+/g, " ")
    .trim();
}

async function httpGet(url, timeout = 20000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      headers: { "user-agent": UA, accept: "*/*" },
      redirect: "follow",
    });
    const text = await r.text();
    return { ok: r.ok, status: r.status, text };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- RSS / Atom ----------
function parseRss(text) {
  const out = [];
  const blocks = [
    ...text.matchAll(/<item>([\s\S]*?)<\/item>/g),
    ...text.matchAll(/<entry>([\s\S]*?)<\/entry>/g),
  ];
  for (const b of blocks) {
    const s = b[1];
    const pick = (re) => (s.match(re) || [])[1] || "";
    const title = stripHtml(pick(/<title[^>]*>([\s\S]*?)<\/title>/));
    let link = stripHtml(pick(/<link>([\s\S]*?)<\/link>/));
    if (!link) {
      const m = s.match(/<link[^>]*href="([^"]+)"/);
      if (m) link = m[1];
    }
    const desc = stripHtml(
      pick(/<description>([\s\S]*?)<\/description>/) ||
        pick(/<summary[^>]*>([\s\S]*?)<\/summary>/) ||
        pick(/<content[^>]*>([\s\S]*?)<\/content>/)
    );
    const date = stripHtml(
      pick(/<pubDate>([\s\S]*?)<\/pubDate>/) ||
        pick(/<updated>([\s\S]*?)<\/updated>/) ||
        pick(/<dc:date>([\s\S]*?)<\/dc:date>/)
    );
    if (!title || !link) continue;
    out.push({ title, url: link, summary: desc.slice(0, 500), publishedAt: parseDate(date) });
  }
  return out;
}

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// ---------- GitHub Search API ----------
function parseGithub(text) {
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    return [];
  }
  if (!j.items) return [];
  return j.items.map((it) => ({
    title: it.full_name + (it.language ? ` [${it.language}]` : ""),
    url: it.html_url,
    summary: `${it.description || "(无描述)"}  ⭐ ${it.stargazers_count}`,
    publishedAt: it.pushed_at || it.updated_at || null,
    extra: { stars: it.stargazers_count, lang: it.language, topics: it.topics },
  }));
}

// ---------- HackerNews (Algolia) ----------
function parseHn(text) {
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    return [];
  }
  return (j.hits || []).map((h) => ({
    title: h.title || h.story_title || "(无标题)",
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    summary: `HN 讨论 · ${h.points || 0} 分 · ${h.num_comments || 0} 评论`,
    publishedAt: h.created_at || null,
  }));
}

// ---------- Reddit ----------
function parseReddit(text) {
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    return [];
  }
  const children = j?.data?.children || [];
  return children.map((c) => {
    const d = c.data;
    return {
      title: d.title,
      url: "https://reddit.com" + d.permalink,
      summary: (d.selftext || d.url_overridden_by_dest || "").slice(0, 400),
      publishedAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
      extra: { score: d.score, comments: d.num_comments },
    };
  });
}

// ---------- 静态页面：只取标题+描述，作为“可用性检查” ----------
function parsePage(text, src) {
  const title =
    stripHtml((text.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || "") || src.name;
  const desc = stripHtml(
    (text.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i) || [])[1] || ""
  );
  return [
    {
      title,
      url: src.url,
      summary: (src.note ? src.note + " · " : "") + (desc || "免费层服务页面"),
      publishedAt: null,
    },
  ];
}

// ---------- Markdown 聚合仓库 ----------
import { parseMarkdownList } from "./md-source.js";
import { fetchTelegramChannel } from "./tg-source.js";

export async function fetchSource(src) {
  // Telegram 频道
  if (src.kind === "telegram") {
    const started = Date.now();
    const r = await fetchTelegramChannel(src.channel, { limit: src.limit || 30 });
    return { src, ok: r.ok, error: r.error, items: r.items, ms: Date.now() - started };
  }

  // Markdown 源走独立通道（体积大、需解析）
  if (src.kind === "md") {
    const started = Date.now();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 40000);
    try {
      const r = await fetch(src.url, {
        signal: ctl.signal,
        headers: { "user-agent": UA },
        redirect: "follow",
      });
      if (!r.ok) {
        return { src, ok: false, error: `HTTP ${r.status}`, items: [], ms: Date.now() - started };
      }
      const md = await r.text();
      const items = parseMarkdownList(md, {
        sections: src.sections,
        subsections: src.subsections,
        requireFree: src.requireFree,
      });
      return { src, ok: true, error: null, items, ms: Date.now() - started };
    } catch (e) {
      return {
        src,
        ok: false,
        error: e.name === "AbortError" ? "超时" : e.message,
        items: [],
        ms: Date.now() - started,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  const started = Date.now();
  let res;
  try {
    res = await httpGet(src.url, src.kind === "page" ? 25000 : 20000);
  } catch (e) {
    return { src, ok: false, error: e.name === "AbortError" ? "超时" : e.message, items: [], ms: Date.now() - started };
  }
  if (!res.ok) {
    return { src, ok: false, error: `HTTP ${res.status}`, items: [], ms: Date.now() - started };
  }

  let items = [];
  switch (src.kind) {
    case "rss":
      items = parseRss(res.text);
      break;
    case "github":
      items = parseGithub(res.text);
      break;
    case "hn":
      items = parseHn(res.text);
      break;
    case "reddit":
      items = parseReddit(res.text);
      break;
    case "page":
      items = parsePage(res.text, src);
      break;
    default:
      items = [];
  }

  return {
    src,
    ok: true,
    error: null,
    items: items.filter((i) => i.title && i.url),
    ms: Date.now() - started,
  };
}
