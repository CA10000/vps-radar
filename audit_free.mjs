// 实测免费云服务：可达性 + 注册门槛 + 真实额度
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const targets = [
  ["InstaBox",          "https://instabox.sh/"],
  ["The Vibe Hosting",  "https://thevibe.host/"],
  ["Uppcoder",          "https://uppcoder.com/"],
  ["Gigalixir",         "https://gigalixir.com/"],
  ["Koyeb",             "https://www.koyeb.com/pricing"],
  ["Northflank",        "https://northflank.com/pricing"],
  ["Fly.io",            "https://fly.io/docs/about/pricing/"],
  ["Render",            "https://render.com/pricing"],
  ["Railway",           "https://railway.com/pricing"],
  ["Oracle Free",       "https://www.oracle.com/cloud/free/"],
  ["GCP Free",          "https://cloud.google.com/free"],
  ["AWS Free",          "https://aws.amazon.com/free/"],
  ["Azure Free",        "https://azure.microsoft.com/en-us/pricing/free-services/"],
  ["IBM Cloud",         "https://www.ibm.com/cloud/free"],
  ["Alibaba Free",      "https://www.alibabacloud.com/en/free"],
  ["Cloudflare Workers","https://developers.cloudflare.com/workers/platform/pricing/"],
  ["Deno Deploy",       "https://deno.com/deploy/pricing"],
  ["Vercel",            "https://vercel.com/pricing"],
  ["Netlify",           "https://www.netlify.com/pricing/"],
  ["Supabase",          "https://supabase.com/pricing"],
  ["Neon",              "https://neon.com/pricing"],
  ["Upstash",           "https://upstash.com/pricing"],
  ["CockroachDB",       "https://www.cockroachlabs.com/pricing/"],
  ["MongoDB Atlas",     "https://www.mongodb.com/pricing"],
  ["Redis Cloud",       "https://redis.io/pricing/"],
  ["Codespaces",        "https://github.com/features/codespaces"],
  ["Gitpod",            "https://www.gitpod.io/pricing"],
  ["Google Colab",      "https://colab.research.google.com/"],
  ["Kaggle",            "https://www.kaggle.com/"],
  ["Hugging Face",      "https://huggingface.co/pricing"],
  ["Modal",             "https://modal.com/pricing"],
  ["Replicate",         "https://replicate.com/pricing"],
  ["Cerebras",          "https://cloud.cerebras.ai/"],
  ["Groq",              "https://groq.com/pricing/"],
  ["Together AI",       "https://www.together.ai/pricing"],
  ["OpenRouter",        "https://openrouter.ai/pricing"],
  ["Backblaze B2",      "https://www.backblaze.com/cloud-storage/pricing"],
  ["Cloudflare R2",     "https://developers.cloudflare.com/r2/pricing/"],
  ["Turso",             "https://turso.tech/pricing"],
  ["PlanetScale",       "https://planetscale.com/pricing"],
];

// 关键词：判断注册门槛
const PATTERNS = {
  card: /credit\s*card|payment\s*method|billing|绑卡|信用卡|需.*卡/i,
  phone: /phone\s*verification|verify\s*your\s*phone|手机验证|手机号/i,
  free: /free\s*tier|always\s*free|永久免费|free\s*plan|free\s*forever/i,
  signup: /sign\s*up|get\s*started|register|注册|开始使用/i,
};

const results = [];

async function testOne(name, url) {
  const t0 = Date.now();
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 20000);
    const r = await fetch(url, {
      signal: ctl.signal,
      headers: { "user-agent": UA, accept: "text/html,*/*" },
      redirect: "follow",
    });
    clearTimeout(to);
    const html = await r.text();
    const txt = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    results.push({
      name,
      url,
      status: r.status,
      ok: r.ok,
      ms: Date.now() - t0,
      size: html.length,
      card: PATTERNS.card.test(txt),
      phone: PATTERNS.phone.test(txt),
      free: PATTERNS.free.test(txt),
      signup: PATTERNS.signup.test(txt),
    });
    const flags = [
      r.ok ? "UP" : "DOWN",
      PATTERNS.free.test(txt) ? "FREE" : "----",
      PATTERNS.card.test(txt) ? "CARD?" : "-----",
      PATTERNS.phone.test(txt) ? "PHONE?" : "------",
    ].join(" ");
    console.log(`  ${String(r.status).padEnd(4)} ${flags} ${String(Date.now() - t0).padStart(5)}ms  ${name}`);
  } catch (e) {
    results.push({ name, url, status: 0, ok: false, error: e.message.slice(0, 50) });
    console.log(`  ERR       DOWN  ----- ----- ------  ${name} (${e.message.slice(0, 40)})`);
  }
}

console.log("════════ 实测免费服务可达性 + 注册门槛 ════════\n");

const CONC = 6;
for (let i = 0; i < targets.length; i += CONC) {
  await Promise.all(targets.slice(i, i + CONC).map(([n, u]) => testOne(n, u)));
  await new Promise((s) => setTimeout(s, 300));
}

// 输出汇总
const up = results.filter((r) => r.ok);
const down = results.filter((r) => !r.ok);
console.log(`\n════════ 汇总 ════════`);
console.log(`可达: ${up.length}/${results.length}`);
console.log(`不可达: ${down.length}`);
if (down.length) console.log(`  ${down.map((d) => d.name).join(", ")}`);

const needCard = up.filter((r) => r.card);
console.log(`\n页面提到信用卡: ${needCard.length} 个`);
console.log(`  ${needCard.map((d) => d.name).join(", ")}`);

const noHs = up.filter((r) => r.phone);
console.log(`\n页面提到手机验证: ${noHs.length} 个`);
console.log(`  ${noHs.map((d) => d.name).join(", ")}`);

// 存 JSON 供后续生成表格
await Bun.write("free-services-audit.json", JSON.stringify(results, null, 2));
console.log(`\n明细已保存: free-services-audit.json`);
