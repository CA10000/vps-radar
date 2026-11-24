// 解析 Markdown 聚合仓库（free-for-dev / awesome-selfhosted 类）
import { sleep } from "./fetcher.js";

const UA = "Mozilla/5.0 (compatible; VPSRadar/1.0)";

// 从 Markdown 中提取条目： - [标题](url) - 描述
// 只保留指定章节（按 ## 标题匹配）
export function parseMarkdownList(md, opts = {}) {
  const { sections = null, requireFree = false } = opts;
  const out = [];

  // 按 ## 切章节
  const parts = md.split(/^##\s+/m);
  const head = parts.shift() || ""; // 第一个是文件头

  const chunks = [];
  if (!sections || sections === "all") {
    chunks.push(head);
    chunks.push(...parts);
  } else {
    for (const p of parts) {
      const title = p.split("\n")[0].trim().toLowerCase();
      if (sections.some((s) => title.includes(s.toLowerCase()))) chunks.push(p);
    }
  }

  for (const chunk of chunks) {
    const sectionTitle = chunk.split("\n")[0].trim() || "其他";
    // 支持按三级标题(###)细分过滤
    let subFilter = null;
    if (opts.subsections && opts.subsections.length) {
      subFilter = opts.subsections.map((s) => s.toLowerCase());
    }

    let inSub = true;
    for (const line of chunk.split("\n")) {
      // 遇到 ### 标题时判断是否在目标子章节内
      const h3 = line.match(/^###\s+(.+)$/);
      if (h3) {
        inSub = subFilter ? subFilter.some((s) => h3[1].toLowerCase().includes(s)) : true;
        continue;
      }
      if (!inSub) continue;
      // 匹配: * [Title](url) - desc  或  - [Title](url) - desc
      const m = line.match(/^\s*[-*]\s+\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s*(?:[-–—:]\s*)?(.*)$/);
      if (!m) continue;
      const [, title, url, desc] = m;
      // 跳过目录锚点
      if (url.includes("](#") || url.startsWith("#")) continue;
      try {
        const u = new URL(url);
        if (!u.hostname.includes(".")) continue;
      } catch {
        continue;
      }
      const summary = desc.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
      if (requireFree && !/free|免费/i.test(`${title} ${summary}`)) continue;
      out.push({
        title: title.trim(),
        url: url.trim(),
        summary: summary.slice(0, 400),
        publishedAt: null,
        extra: { section: sectionTitle },
      });
    }
  }
  return out;
}

// GitHub 仓库的 README（raw）
export async function fetchMarkdownSource(src) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30000);
  try {
    const r = await fetch(src.url, {
      signal: ctl.signal,
      headers: { "user-agent": UA },
      redirect: "follow",
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}`, items: [] };
    const md = await r.text();
    const items = parseMarkdownList(md, { sections: src.sections, requireFree: src.requireFree });
    return { ok: true, error: null, items };
  } catch (e) {
    return { ok: false, error: e.message, items: [] };
  } finally {
    clearTimeout(timer);
  }
}
