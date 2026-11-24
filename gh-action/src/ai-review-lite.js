// AI 审核（JSON 版）：判定"是不是机器"+"是不是真免费"
const KEY = process.env.DEEPSEEK_API_KEY || "";
const BASE = process.env.DEEPSEEK_BASE || "https://api.deepseek.com";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// 官方页面：本身权威，跳过 AI
const TRUSTED = new Set([
  "oracle-free", "gcp-free", "aws-free", "cf-workers", "fly-io", "railway",
  "vercel", "render", "azure-free", "ibm-free", "koyeb", "neon", "upstash",
  "deno-deploy", "netlify", "codespaces", "gitpod",
]);

// 聚合仓库：全部送审
const AGGREGATOR = new Set([
  "free-for-dev", "awesome-selfhosted", "awesome-free-services", "awesome-free-cloud-notebooks",
]);

const FREE_STRONG = /免费|白嫖|永久免费|零成本|不收费|免费领|免费送|免费试用|免费额度/i;
const FREE_EN = /\bfree\b|\bfree\s*tier\b|\balways\s*free\b|\bno\s*cost\b|\$0\b|\bgiveaway\b|\bcredit\b|\btrial\b/i;
const NOT_FREE = /[\[【]\s*(出|收|求|售|租)\s*[\]】]|溢价|剩余价值|带价|私信|收一个|出一个|求一个|出租|转让/i;

export function needsAiReview(item) {
  if (TRUSTED.has(item.source_id)) return false;
  const text = `${item.title} ${item.summary}`;
  if (NOT_FREE.test(item.title)) return false;
  if (AGGREGATOR.has(item.source_id)) return true;
  return FREE_STRONG.test(text) || FREE_EN.test(text);
}

const SYSTEM = `你是「免费服务器」猎手。用户要的是【能跑程序、有 shell/root 的机器】，不是各种云 API 服务。

═══ 只有"机器"才算 is_server = true ═══
- VPS / 云主机 / 独立服务器
- 容器实例（Docker/K8s）
- 免费层可计算实例（EC2/GCE/Oracle ARM）
- PaaS 应用托管（Render/Railway/Fly.io/Koyeb）
- 沙盒/在线 IDE（Codespaces、Cloud Shell、Colab）
- 能 SSH 登录的免费机

═══ 以下不是机器 → is_server = false ═══
消息队列(SNS/SQS)、数据库(DynamoDB/Neon/Supabase)、推送(Notification Hubs)、
身份认证(AD/Auth0)、监控(CloudWatch)、CDN/存储(S3/CloudFront/R2)、
CI流水线(CodePipeline)、SaaS工具、纯静态托管、域名/DNS/SSL

═══ 蹭额度 hack → 两者都 false ═══
GitHub Actions 跑 VNC/容器伪装 VPS、白嫖 CI 额度跑常驻服务、反复注册试用期

输出严格 JSON：
{
  "is_server": true/false,
  "is_free": true/false,
  "confidence": 0-100,
  "real_free": "免费的是什么（中文70字内）",
  "cost": "完全免费/需绑卡/$5.99月付/需购买/未知",
  "risks": "风险提示（中文50字内，无风险填 无）",
  "category_tag": "免费云主机/免费PaaS/免费沙盒IDE/免费试用/免费赠送/蹭额度hack/低价促销/二手交易/非服务器服务/技术讨论/无关内容"
}`;

async function fetchArticle(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 18000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { "user-agent": UA }, redirect: "follow" });
    if (!r.ok) return "";
    const html = await r.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 5000);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

export async function reviewItem(item) {
  // 摘要够长就不抓原文，省时间
  const content = (item.summary || "").length >= 80 ? "" : await fetchArticle(item.url);

  const r = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `【标题】${item.title}
【来源】${item.source_name}
【链接】${item.url}
【摘要】${item.summary || "无"}
【原文】${content || "（无法抓取，降低置信度）"}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 400,
      response_format: { type: "json_object" },
    }),
  });

  if (!r.ok) throw new Error(`API ${r.status}`);
  const j = await r.json();
  const raw = j.choices?.[0]?.message?.content || "{}";
  let p;
  try {
    p = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    p = m ? JSON.parse(m[0]) : {};
  }

  const result = {
    is_server: p.is_server === true,
    is_free: !!p.is_free,
    confidence: Math.max(0, Math.min(100, Number(p.confidence) || 0)),
    real_free: String(p.real_free || "").slice(0, 150),
    cost: String(p.cost || "").slice(0, 80),
    risks: String(p.risks || "").slice(0, 100),
    category_tag: String(p.category_tag || "").slice(0, 20),
  };

  // 硬规则：CI 蹭额度一律剔除
  const text = `${item.title} ${item.summary} ${result.real_free}`;
  const ciHack =
    /github\s*actions|codespaces|gitlab\s*ci|ci\/cd.*额度/i.test(text) &&
    /vps|novnc|android|bore|tunnel|vnc|桌面|伪装|服务器|root|ssh|vm|沙盒/i.test(text);
  const selfAdmit =
    /(依赖|借助|利用).{0,12}(github\s*actions|codespaces|ci\s*额度)/i.test(result.real_free) &&
    /限制|封号|条款/i.test(result.risks);

  if (ciHack || selfAdmit) {
    result.is_server = false;
    result.is_free = false;
    result.category_tag = "蹭额度hack";
    result.risks = "利用 CI/CD 免费额度充当服务器，违反条款，随时封号";
  }

  return result;
}
