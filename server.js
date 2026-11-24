import { queryItems, stats, markRead, toggleSave, markAllRead, aiStats } from "./db.js";
import { crawlAll, runAiReview } from "./crawler.js";
import { CATEGORIES } from "./sources.js";
import { HTML } from "./ui.js";

const PORT = Number(process.env.PORT || 8090);
let crawling = false;
let reviewing = false;
let lastResult = null;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function handleApi(req, url) {
  const p = url.pathname;

  if (p === "/api/items") {
    const cat = url.searchParams.get("cat") || "all";
    const q = url.searchParams.get("q") || "";
    const limit = Math.min(Number(url.searchParams.get("limit") || 300), 1000);
    const onlyUnread = url.searchParams.get("unread") === "1";
    const onlySaved = url.searchParams.get("saved") === "1";
    const onlyFree = url.searchParams.get("free") === "1";
    const items = queryItems({ cat, q, limit, onlyUnread, onlySaved, onlyFree });
    return json({ items, categories: CATEGORIES });
  }

  if (p === "/api/stats") {
    return json({ ...stats(), ai: aiStats(), crawling, reviewing, lastResult });
  }

  if (p === "/api/review" && req.method === "POST") {
    if (reviewing) return json({ ok: false, error: "审核进行中" }, 409);
    reviewing = true;
    try {
      const r = await runAiReview({ verbose: false });
      return json({ ok: true, ...r });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    } finally {
      reviewing = false;
    }
  }

  if (p === "/api/crawl" && req.method === "POST") {
    if (crawling) return json({ ok: false, error: "已在抓取中" }, 409);
    crawling = true;
    const cat = url.searchParams.get("cat");
    try {
      const r = await crawlAll({ cat: cat && cat !== "all" ? cat : null, verbose: false });
      lastResult = { at: new Date().toISOString(), totalFound: r.totalFound, totalNew: r.totalNew };
      return json({ ok: true, ...r });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    } finally {
      crawling = false;
    }
  }

  if (p === "/api/read" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    if (body.all) markAllRead(body.cat);
    else if (body.id) markRead(body.id, body.read !== false);
    return json({ ok: true });
  }

  if (p === "/api/save" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    if (!body.id) return json({ ok: false, error: "缺少 id" }, 400);
    const v = toggleSave(body.id);
    return json({ ok: true, saved: v });
  }

  return json({ error: "not found" }, 404);
}

const server = Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  idleTimeout: 255, // 抓取可能耗时 1-2 分钟，放宽到 255 秒（Bun 上限）
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(req, url);
      } catch (e) {
        return json({ ok: false, error: String(e) }, 500);
      }
    }
    return new Response(HTML, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
});

const AUTO_MIN = Number(process.env.AUTO_CRAWL_MIN || 30);

console.log(`\n  VPS 雷达已启动`);
console.log(`  → http://127.0.0.1:${PORT}`);
console.log(`  → 自动抓取：每 ${AUTO_MIN} 分钟\n`);

// 自动定时抓取
async function autoCrawl() {
  if (crawling) return;
  crawling = true;
  try {
    const r = await crawlAll({ verbose: false });
    lastResult = { at: new Date().toISOString(), totalFound: r.totalFound, totalNew: r.totalNew };
    console.log(
      `[自动抓取] ${new Date().toLocaleString("zh-CN")} 发现 ${r.totalFound} 条，新增 ${r.totalNew} 条`
    );
  } catch (e) {
    console.log(`[自动抓取] 失败: ${e.message}`);
    return;
  } finally {
    crawling = false;
  }

  // 抓取完成后自动跑 AI 审核
  if (reviewing) return;
  reviewing = true;
  try {
    const a = await runAiReview({ verbose: true });
    if (a.reviewed > 0) {
      console.log(
        `[自动审核] ${new Date().toLocaleString("zh-CN")} 审核 ${a.reviewed} 条，真免费 ${a.free} 条`
      );
    }
  } catch (e) {
    console.log(`[自动审核] 失败: ${e.message}`);
  } finally {
    reviewing = false;
  }
}

if (AUTO_MIN > 0) {
  // 启动 10 秒后先跑一次
  setTimeout(autoCrawl, 10000);
  setInterval(autoCrawl, AUTO_MIN * 60 * 1000);
}

export { server };
