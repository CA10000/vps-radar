// AI 审核：抓原文 → DeepSeek 判断 → 结构化结论
import { stripHtml, sleep } from "./fetcher.js";

const KEY = process.env.DEEPSEEK_API_KEY || "";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const BASE = process.env.DEEPSEEK_BASE || "https://api.deepseek.com";
const MAX_CHARS = Number(process.env.AI_MAX_CONTENT_CHARS || 6000);

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ---------- 预筛：只让可能有"真免费"的条目进入 AI 审核 ----------
// 强信号：明确出现"免费/赠送/试用额度"等词
const FREE_STRONG =
  /免费|白嫖|永久免费|零成本|不收费|免费领|免费送|免费试用|免费额度|送\s*\d|赠\s*\d|白送|不要钱|免费得/i;
const FREE_EN =
  /\bfree\b|\bfree\s*tier\b|\bfree\s*forever\b|\balways\s*free\b|\bno\s*cost\b|\bfor\s*free\b|\$0\b|\bzero\s*cost\b|\bgiveaway\b|\bgive\s*away\b|\bcredit\b|\bcoupon\b|\bvoucher\b|\btrial\b|\bbonus\b|\bwin\b/i;

// 排除：二手交易/求购/出租，这些不是"免费资源"
const NOT_FREE =
  /[\[【]\s*(出|收|求|售|租)\s*[\]】]|溢价|剩余价值|带价|私信|pm我|收一个|出一个|求一个|出租|转让|push出|代购/i;

// 官方页面源（本身权威，无需 AI 审核）
const TRUSTED_PAGE_SOURCES = new Set([
  "oracle-free",
  "gcp-free",
  "aws-free",
  "cf-workers",
  "fly-io",
  "railway",
  "vercel",
  "render",
  "azure-free",
  "ibm-free",
  "koyeb",
  "neon",
  "upstash",
  "deno-deploy",
  "netlify",
  "codespaces",
  "gitpod",
]);

// 聚合仓库：条目本身来自"免费清单"，需 AI 逐条核实是否真是服务器类
const AGGREGATOR_SOURCES = new Set([
  "free-for-dev",
  "awesome-selfhosted",
  "awesome-free-services",
  "awesome-free-cloud-notebooks",
]);

export function needsAiReview(item) {
  // 权威官方页面：跳过 AI（但仍在库里展示）
  if (TRUSTED_PAGE_SOURCES.has(item.source_id)) return false;

  const text = `${item.title || ""} ${item.summary || ""}`;

  // 二手交易/求购，直接排除（不是可领取的免费资源）
  if (NOT_FREE.test(item.title || "")) return false;

  // 聚合仓库（free-for-dev 等）本身就是"免费服务清单"，全部送审
  if (AGGREGATOR_SOURCES.has(item.source_id)) return true;

  if (FREE_STRONG.test(text)) return true;
  if (FREE_EN.test(text)) return true;
  return false;
}

// ---------- 抓原文正文 ----------
async function fetchArticle(url, timeout = 20000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      headers: { "user-agent": UA, accept: "text/html,*/*" },
      redirect: "follow",
    });
    if (!r.ok) return { ok: false, text: "", status: r.status };
    const html = await r.text();
    // 优先取正文区域
    let body = html;
    const art =
      html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
      html.match(/<div[^>]+class="[^"]*(?:post|content|article|entry|message)[^"]*"[^>]*>([\s\S]{500,}?)<\/div>/i) ||
      html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (art) body = art[1];
    const text = stripHtml(body);
    return { ok: true, text: text.slice(0, MAX_CHARS), status: r.status };
  } catch (e) {
    return { ok: false, text: "", status: 0, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- 构造提示词 ----------
const SYSTEM_PROMPT = `你是一个「免费服务器」猎手。用户要的是【能跑程序、能装系统、有 shell/root 的机器】，不是各种云 API 服务。

═══ 核心判断：这是"机器"还是"服务"？ ═══

**只有"机器"才算 is_free = true：**
- VPS / 云主机 / 独立服务器
- 容器实例（Docker/K8s 可跑应用）
- 免费层里的可计算实例（EC2/GCE e2-micro/Oracle ARM）
- PaaS 应用托管（Render/Railway/Fly.io/Koyeb，能部署自己的程序）
- 沙盒/在线 IDE（Codespaces、Cloud Shell、Colab，有 shell 能跑代码）
- 能 SSH 登录的免费机

**以下虽然免费，但不是服务器 → is_free = false（关键！）：**
- 消息队列：SNS、SQS、Kafka、RabbitMQ
- 数据库：DynamoDB、Cosmos DB、Firestore、Neon、Supabase、MongoDB Atlas
- 推送通知：Notification Hubs、FCM
- 身份认证：Active Directory、Auth0、Okta
- 监控告警：CloudWatch、Datadog
- CDN/存储：CloudFront、S3、Backblaze B2
- CI/CD 流水线：CodePipeline、Azure Pipelines（除非能跑任意代码）
- 表单/邮件/短信/翻译/搜索 等 SaaS 工具
- 纯静态网站托管（不能跑后端逻辑的）
- 域名/DNS/SSL 证书

═══ 其他 is_free = true 的必须条件 ═══
1. 免费是官方正规产品，无需付费即可用
2. 有实际的机器资源（CPU/内存/磁盘），不是"几万次 API 调用"

═══ 判 false 的其他情况 ═══
- 需要付费（哪怕 $1/年、€1/月）
- 仅优惠折扣（30% OFF、优惠码）
- 二手转卖、出租、求购
- 纯技术讨论、新闻
- **蹭额度 hack**（关键！）：
  · GitHub Actions 跑 VNC/容器伪装 VPS
  · 白嫖 CI 额度跑常驻服务
  · 反复注册试用期
  这类违反条款、随时封号，必须 false，risks 写明"违反平台条款，有封号风险"

═══ 三个关键字段 ═══
- **is_server**：true/false —— 这到底是不是一台"机器"（最重要！）
- **is_free**：true/false —— 是不是免费（两者都为 true 才是用户要的）
- category_tag 从这些里选：免费云主机 / 免费PaaS / 免费沙盒IDE / 免费试用 / 免费赠送 / 蹭额度hack / 低价促销 / 二手交易 / 非服务器服务 / 技术讨论 / 无关内容

输出严格 JSON：
{
  "is_server": true/false,
  "is_free": true/false,
  "confidence": 0-100,
  "real_free": "免费的是什么（中文70字内）；非机器则说明它是什么服务",
  "cost": "实际成本，如：完全免费 / 需绑卡 / $5.99月付 / 需购买 / 未知",
  "risks": "风险提示（中文50字内，无风险填 无）",
  "category_tag": "上述标签之一"
}`;

function buildUserPrompt(item, content) {
  return `【标题】${item.title}
【来源】${item.source_name}
【链接】${item.url}
【摘要】${item.summary || "无"}
【原文正文（截断）】
${content || "（无法抓取原文，请基于标题和摘要判断，并降低 confidence）"}`;
}

// ---------- 调用 DeepSeek ----------
export async function callDeepSeek(item, content) {
  if (!KEY) throw new Error("未配置 DEEPSEEK_API_KEY");

  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(item, content) },
    ],
    temperature: 0.1,
    max_tokens: 400,
    response_format: { type: "json_object" },
  };

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 60000);
  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      signal: ctl.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
      body: JSON.stringify(body),
    });
    const txt = await r.text();
    if (!r.ok) {
      throw new Error(`API ${r.status}: ${txt.slice(0, 200)}`);
    }
    const j = JSON.parse(txt);
    const raw = j.choices?.[0]?.message?.content || "{}";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // 兜底：从文本里抠 JSON
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }
    return {
      is_server: parsed.is_server === true,
      is_free: !!parsed.is_free,
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
      real_free: String(parsed.real_free || "").slice(0, 120),
      cost: String(parsed.cost || "").slice(0, 80),
      risks: String(parsed.risks || "").slice(0, 100),
      category_tag: String(parsed.category_tag || "").slice(0, 20),
      usage: j.usage,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- 单条审核 ----------
export async function reviewItem(item) {
  // 摘要已足够长（如聚合仓库的条目），跳过抓原文省时间/token
  const hasGoodSummary = (item.summary || "").length >= 80;
  let article = { ok: false, text: "" };

  if (!hasGoodSummary) {
    article = await fetchArticle(item.url);
  }

  const result = await callDeepSeek(item, article.ok ? article.text : "");

  // ── 硬规则兜底：凡是把 CI/CD 免费额度当服务器用的，一律剔除 ──
  const text = `${item.title} ${item.summary} ${result.real_free || ""}`;
  const isCiHack =
    /github\s*actions|codespaces|gitlab\s*ci|cloudflare\s*pages.*build|ci\/cd.*额度/i.test(text) &&
    /vps|novnc|android|bore|tunnel|vnc|桌面|伪装|服务器|root|ssh|vm|沙盒/i.test(text);

  // 只要 AI 自己在说明里承认"依赖 Actions 额度"，也不可信
  const selfAdmit =
    /(依赖|借助|利用).{0,12}(github\s*actions|codespaces|ci\s*额度|免费额度)/i.test(
      result.real_free || ""
    ) && /限制|封号|条款/i.test(result.risks || "");

  if (isCiHack || selfAdmit) {
    result.is_server = false;
    result.is_free = false;
    result.category_tag = "蹭额度hack";
    result.risks = "利用 CI/CD 免费额度充当服务器，违反平台条款，随时封号";
  }

  return {
    ...result,
    fetched: article.ok,
    fetchedLen: article.text.length,
  };
}

// ---------- 批量审核 ----------
export async function reviewBatch(items, { onProgress, concurrency = 3 } = {}) {
  const results = [];
  let done = 0;

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const rs = await Promise.all(
      batch.map(async (it) => {
        try {
          const r = await reviewItem(it);
          return { item: it, ok: true, ...r };
        } catch (e) {
          return { item: it, ok: false, error: e.message };
        }
      })
    );
    results.push(...rs);
    done += batch.length;
    if (onProgress) onProgress(done, items.length, rs);
    if (i + concurrency < items.length) await sleep(500);
  }
  return results;
}
