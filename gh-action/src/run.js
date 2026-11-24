// GitHub Actions 版抓取器：无 SQLite，数据存 JSON，随仓库提交
import { SOURCES } from "../sources.js";
import { fetchSource, sleep } from "../fetcher.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// src/ 的上一级是 gh-action/，数据放 gh-action/docs/
const DATA_DIR = join(import.meta.dir, "..", "docs");
const DATA_FILE = join(DATA_DIR, "data.json");

const AI_ON = !!process.env.DEEPSEEK_API_KEY;
const AI_MAX = Number(process.env.AI_MAX_PER_ROUND || 60);

// ── 读取已有数据 ──
function loadData() {
  if (!existsSync(DATA_FILE)) return { items: [], lastUpdate: null, runs: [] };
  try {
    return JSON.parse(readFileSync(DATA_FILE, "utf-8"));
  } catch {
    return { items: [], lastUpdate: null, runs: [] };
  }
}

// ── 稳定去重键 ──
function hashItem(sourceId, url) {
  let clean = url;
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|ref|fbclid|gclid|from)/i.test(k)) u.searchParams.delete(k);
    }
    clean = u.origin + u.pathname + u.search;
  } catch {}
  const h = new Bun.CryptoHasher("sha256");
  h.update(`${sourceId}|${clean}`);
  return h.digest("hex").slice(0, 16);
}

function saveData(data) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// ── 抓取 ──
async function crawl() {
  const data = loadData();
  const existing = new Set(data.items.map((i) => i.hash));
  const runStart = new Date().toISOString();
  const added = [];
  const errors = [];

  console.log(`[抓取] ${new Date().toLocaleString("zh-CN")} 共 ${SOURCES.length} 个源`);

  const CONC = 4;
  for (let i = 0; i < SOURCES.length; i += CONC) {
    const batch = SOURCES.slice(i, i + CONC);
    const results = await Promise.all(batch.map((s) => fetchSource(s)));

    for (const r of results) {
      if (!r.ok) {
        errors.push({ source: r.src.id, error: r.error });
        console.log(`  ERR  ${r.src.name.padEnd(24)} ${r.error}`);
        continue;
      }
      let newCount = 0;
      for (const it of r.items) {
        const hash = hashItem(r.src.id, it.url);
        if (existing.has(hash)) continue;
        existing.add(hash);
        added.push({
          hash,
          source_id: r.src.id,
          source_name: r.src.name,
          category: r.src.cat,
          title: it.title,
          url: it.url,
          summary: it.summary || "",
          published_at: it.publishedAt || null,
          found_at: runStart,
          ai: null,
        });
        newCount++;
      }
      console.log(`  OK   ${r.src.name.padEnd(24)} ${r.items.length} 条 / +${newCount} 新`);
    }
    if (i + CONC < SOURCES.length) await sleep(300);
  }

  data.items = [...added, ...data.items].slice(0, 5000); // 最多保留 5000 条
  data.lastUpdate = runStart;
  data.runs = [{ at: runStart, found: added.length, errors }, ...(data.runs || [])].slice(0, 30);
  saveData(data);

  console.log(`\n[抓取完成] 新增 ${added.length} 条，总计 ${data.items.length} 条`);
  return { added: added.length, total: data.items.length };
}

// ── AI 审核 ──
async function review() {
  if (!AI_ON) {
    console.log("[AI 审核] 未配置 key，跳过");
    return { reviewed: 0, free: 0 };
  }
  const { reviewItem, needsAiReview } = await import("./ai-review-lite.js");

  const data = loadData();
  const pending = data.items
    .filter((i) => !i.ai && needsAiReview(i))
    .slice(0, AI_MAX);

  if (!pending.length) {
    console.log("[AI 审核] 无待审条目");
    return { reviewed: 0, free: 0 };
  }

  console.log(`[AI 审核] 待审 ${pending.length} 条`);
  let free = 0;
  let reviewed = 0;

  const CONC = 4;
  for (let i = 0; i < pending.length; i += CONC) {
    const batch = pending.slice(i, i + CONC);
    const rs = await Promise.all(
      batch.map(async (it) => {
        try {
          const r = await reviewItem(it);
          return { it, r };
        } catch (e) {
          return { it, err: e.message };
        }
      })
    );
    for (const { it, r, err } of rs) {
      if (err) continue;
      it.ai = {
        is_server: r.is_server,
        is_free: r.is_free,
        confidence: r.confidence,
        real_free: r.real_free,
        cost: r.cost,
        risks: r.risks,
        tag: r.category_tag,
      };
      reviewed++;
      if (r.is_free && r.is_server) free++;
      const mark = r.is_free && r.is_server ? "✅" : "  ";
      console.log(`  ${mark} ${String(r.confidence).padStart(3)}% ${it.title.slice(0, 46)}`);
    }
    await sleep(300);
  }

  saveData(data);
  console.log(`\n[AI 审核完成] ${reviewed} 条，真免费服务器 ${free} 条`);
  return { reviewed, free };
}

// ── 主流程 ──
const mode = process.argv[2] || "all";
if (mode === "crawl") await crawl();
else if (mode === "review") await review();
else {
  await crawl();
  await review();
}
