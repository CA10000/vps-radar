// 深度核查：真实额度 + 真实注册门槛（区分"需要卡"和"无需卡"）
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// 关键：区分“无卡”和“需卡”
const NEG_CARD = /no\s*credit\s*card|without\s*(a\s*)?credit\s*card|无需信用卡|no\s*card\s*required|don't\s*need\s*a\s*credit\s*card/i;
const POS_CARD = /(require|need|must\s*(add|provide)|add\s*(a\s*)?(credit\s*card|payment)|绑定信用卡|需要信用卡|需绑定)/i;

const checks = [
  {
    name: "InstaBox",
    url: "https://instabox.sh/",
    claim: "4 vCPU / 8 GiB / 20 GiB Firecracker microVM",
    risk: "空闲30分钟暂停，单次最长8小时",
  },
  {
    name: "Uppcoder",
    url: "https://uppcoder.com/",
    claim: "全栈开发环境 + SSH，2GB内存/2GB磁盘",
    risk: "新站点，稳定性未知",
  },
  {
    name: "Gigalixir",
    url: "https://gigalixir.com/",
    claim: "1个永不休眠免费实例 + 免费PostgreSQL",
    risk: "仅支持 Elixir/Phoenix",
  },
  {
    name: "Koyeb",
    url: "https://www.koyeb.com/pricing",
    claim: "2个免费 Nano 服务，512MB",
    risk: "实例会休眠",
  },
  {
    name: "Fly.io",
    url: "https://fly.io/docs/about/pricing/",
    claim: "3台 256MB 共享CPU VM（免费额度）",
    risk: "需绑卡才能创建",
  },
  {
    name: "Render",
    url: "https://render.com/pricing",
    claim: "免费 Web 服务，750小时/月",
    risk: "15分钟无流量休眠",
  },
  {
    name: "Railway",
    url: "https://railway.com/pricing",
    claim: "$5/月免费额度",
    risk: "需GitHub账号，额度用完停服",
  },
  {
    name: "Oracle Cloud",
    url: "https://www.oracle.com/cloud/free/",
    claim: "4核ARM/24GB内存 + 2台AMD永久免费",
    risk: "需绑卡验证；闲置实例会被回收",
  },
  {
    name: "Google Colab",
    url: "https://colab.research.google.com/",
    claim: "免费 GPU/TPU Jupyter 环境",
    risk: "会话最长12小时，不持久",
  },
  {
    name: "Kaggle",
    url: "https://www.kaggle.com/",
    claim: "4核CPU/30GB内存 + 30小时/周 GPU",
    risk: "笔记本保存时间限制9小时",
  },
  {
    name: "Hugging Face",
    url: "https://huggingface.co/pricing",
    claim: "免费 CPU Space + 无限模型下载",
    risk: "Space会休眠，GPU需付费",
  },
  {
    name: "Cloudflare Workers",
    url: "https://developers.cloudflare.com/workers/platform/pricing/",
    claim: "10万请求/天，免费",
    risk: "无持久磁盘，非完整系统",
  },
  {
    name: "Deno Deploy",
    url: "https://deno.com/deploy/pricing",
    claim: "1M 请求/月 + 100GB 流量",
    risk: "仅 JS/TS 运行时",
  },
  {
    name: "Gitpod",
    url: "https://www.gitpod.io/pricing",
    claim: "免费 10 小时/月 云开发环境",
    risk: "额度很少",
  },
  {
    name: "Supabase",
    url: "https://supabase.com/pricing",
    claim: "2个免费项目，500MB数据库",
    risk: "7天不活跃暂停",
  },
  {
    name: "Neon",
    url: "https://neon.com/pricing",
    claim: "免费 Postgres，0.5GB存储",
    risk: "仅数据库",
  },
  {
    name: "Upstash",
    url: "https://upstash.com/pricing",
    claim: "免费 Redis 10K命令/天",
    risk: "仅 Redis/Kafka",
  },
  {
    name: "Backblaze B2",
    url: "https://www.backblaze.com/cloud-storage/pricing",
    claim: "10GB 免费对象存储",
    risk: "仅存储，需绑卡",
  },
  {
    name: "Cloudflare R2",
    url: "https://developers.cloudflare.com/r2/pricing/",
    claim: "10GB 存储 + 免费出站",
    risk: "仅存储",
  },
  {
    name: "Groq",
    url: "https://groq.com/pricing/",
    claim: "免费 LLM API 额度（Llama等）",
    risk: "有速率限制",
  },
  {
    name: "Cerebras",
    url: "https://cloud.cerebras.ai/",
    claim: "免费 LLM 推理额度",
    risk: "需申请",
  },
  {
    name: "Modal",
    url: "https://modal.com/pricing",
    claim: "$30/月免费 GPU/CPU 算力",
    risk: "需绑卡",
  },
];

console.log("═══════ 深度核查注册门槛 ═══════\n");

const out = [];
for (const c of checks) {
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 18000);
    const r = await fetch(c.url, { signal: ctl.signal, headers: { "user-agent": UA }, redirect: "follow" });
    clearTimeout(to);
    const html = await r.text();
    const txt = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    const noCard = NEG_CARD.test(txt);
    const posCard = POS_CARD.test(txt);
    let cardVerdict = "未知";
    if (noCard && !posCard) cardVerdict = "✅ 无需卡";
    else if (posCard && !noCard) cardVerdict = "❌ 需绑卡";
    else if (noCard && posCard) cardVerdict = "⚠️ 说法矛盾";

    out.push({ ...c, status: r.status, cardVerdict, noCard, posCard });
    console.log(`${String(r.status).padEnd(4)} ${cardVerdict.padEnd(12)} ${c.name}`);
  } catch (e) {
    out.push({ ...c, status: 0, cardVerdict: "不可达" });
    console.log(`ERR  ${"不可达".padEnd(12)} ${c.name}`);
  }
  await new Promise((s) => setTimeout(s, 200));
}

await Bun.write("deep-audit.json", JSON.stringify(out, null, 2));
console.log("\n明细: deep-audit.json");
