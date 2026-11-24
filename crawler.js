import { SOURCES } from "./sources.js";
import { fetchSource, sleep } from "./fetcher.js";
import {
  saveItems,
  startRun,
  finishRun,
  getPendingForReview,
  saveAiResult,
  markAiFailed,
} from "./db.js";
import { reviewItem, needsAiReview } from "./ai-review.js";

const AI_ON = process.env.AI_REVIEW_ENABLED !== "0" && !!process.env.DEEPSEEK_API_KEY;
const AI_MAX = Number(process.env.AI_MAX_PER_ROUND || 40);

// AI 审核待办条目（在抓取后执行，控制数量与成本）
export async function runAiReview({ verbose = true, max = AI_MAX } = {}) {
  if (!AI_ON) {
    if (verbose) console.log("[AI 审核] 已关闭或未配置 key，跳过\n");
    return { reviewed: 0, free: 0, tokens: 0, skipped: 0 };
  }

  const pending = getPendingForReview(max * 3);
  const todo = pending.filter(needsAiReview).slice(0, max);
  const skipped = pending.length - todo.length;

  if (!todo.length) {
    if (verbose) console.log(`[AI 审核] 无待审条目（预筛后跳过 ${skipped} 条无关内容）\n`);
    return { reviewed: 0, free: 0, tokens: 0, skipped };
  }

  if (verbose)
    console.log(`[AI 审核] 待审 ${todo.length} 条（预筛跳过 ${skipped} 条），开始逐条核查…\n`);

  let reviewed = 0;
  let free = 0;
  let tokens = 0;
  let idx = 0;

  // 并发 5 条，大幅提速
  const CONC = 5;
  for (let i = 0; i < todo.length; i += CONC) {
    const batch = todo.slice(i, i + CONC);
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
      idx++;
      const tag = `  (${idx}/${todo.length})`;
      if (err) {
        markAiFailed(it.id, err);
        if (verbose) console.log(`${tag} 失败: ${err.slice(0, 60)}`);
        continue;
      }
      const tk = (r.usage?.prompt_tokens || 0) + (r.usage?.completion_tokens || 0);
      tokens += tk;
      reviewed++;
      if (r.is_free) free++;
      saveAiResult(it.id, { ...r, tokens: tk });

      if (verbose) {
        const mark = r.is_free ? "✅真免费" : " 非免费";
        console.log(`${tag} ${mark} ${String(r.confidence).padStart(3)}%  ${it.title.slice(0, 46)}`);
        if (r.is_free) console.log(`        └ ${r.real_free}`);
      }
    }
    await sleep(300);
  }

  if (verbose)
    console.log(`\n[AI 审核完成] 审核 ${reviewed} 条，其中真免费 ${free} 条，消耗 ${tokens} tokens\n`);

  return { reviewed, free, tokens, skipped };
}

/**
 * 抓取全部（或指定分类）源
 * @param {object} opt { cat?: 'A'|'B'|'C', concurrency?: number, verbose?: boolean }
 */
export async function crawlAll({ cat = null, concurrency = 4, verbose = true } = {}) {
  const list = cat ? SOURCES.filter((s) => s.cat === cat) : SOURCES;
  const runId = startRun();
  const detail = [];
  let totalFound = 0;
  let totalNew = 0;

  if (verbose) console.log(`\n[抓取开始] ${new Date().toLocaleString("zh-CN")}  共 ${list.length} 个源\n`);

  // 分批并发，避免一次性打爆
  for (let i = 0; i < list.length; i += concurrency) {
    const batch = list.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((s) => fetchSource(s)));

    for (const r of results) {
      const tag = r.ok ? "OK " : "ERR";
      const cnt = r.items.length;
      totalFound += cnt;

      if (r.ok) {
        const { inserted: added, skipped } = saveItems(r.src, r.items);
        totalNew += added;
        detail.push({ id: r.src.id, ok: true, found: cnt, added, skipped, ms: r.ms });
        if (verbose) {
          const flag = added > 0 ? `+${added} 新` : "无新增";
          const skip = skipped > 0 ? ` (过滤 ${skipped})` : "";
          console.log(
            `  ${tag} [${r.src.cat}] ${r.src.name.padEnd(24)} ${String(cnt).padStart(3)} 条  ${flag.padEnd(8)}${skip} ${r.ms}ms`
          );
        }
      } else {
        detail.push({ id: r.src.id, ok: false, error: r.error, ms: r.ms });
        if (verbose) console.log(`  ${tag} [${r.src.cat}] ${r.src.name.padEnd(24)} 失败: ${r.error}`);
      }
    }
    if (i + concurrency < list.length) await sleep(400);
  }

  finishRun(runId, totalFound, totalNew, detail);
  if (verbose) {
    console.log(`\n[抓取完成] 共发现 ${totalFound} 条，其中新增 ${totalNew} 条\n`);
  }
  return { runId, totalFound, totalNew, detail };
}

// 直接执行
if (import.meta.main) {
  const arg = process.argv[2];
  const cat = arg && ["A", "B", "C"].includes(arg.toUpperCase()) ? arg.toUpperCase() : null;
  await crawlAll({ cat });
  await runAiReview();
}
