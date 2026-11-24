// 精确验证 InstaBox / Koyeb / Fly.io / Render 的真实免费限制
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function grab(url) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 20000);
  const r = await fetch(url, { signal: ctl.signal, headers: { "user-agent": UA }, redirect: "follow" });
  clearTimeout(to);
  const html = await r.text();
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

// InstaBox: 找免费额度描述
console.log("\n=== InstaBox 免费额度 ===");
const ib = await grab("https://instabox.sh/");
for (const kw of ["free plan", "Free plan", "vCPU", "GiB", "session", "pause"]) {
  const idx = ib.indexOf(kw);
  if (idx > -1) console.log(`  [${kw}] ...${ib.slice(Math.max(0, idx - 80), idx + 150).trim()}`);
}

// Koyeb: 确认绑卡
console.log("\n=== Koyeb 绑卡要求 ===");
const kb = await grab("https://www.koyeb.com/docs/faqs/pricing");
for (const kw of ["require a credit card", "Why does Koyeb", "free tier", "credit card"]) {
  const idx = kb.indexOf(kw);
  if (idx > -1) console.log(`  [${kw}] ...${kb.slice(Math.max(0, idx - 60), idx + 200).trim()}`);
}

// Fly.io: 绑卡
console.log("\n=== Fly.io 免费政策 ===");
const fl = await grab("https://fly.io/docs/about/pricing/");
for (const kw of ["Free Plan", "credit card", "waiver", "pay as you go"]) {
  const idx = fl.indexOf(kw);
  if (idx > -1) console.log(`  [${kw}] ...${fl.slice(Math.max(0, idx - 60), idx + 200).trim()}`);
}

// Render: 免费实例限制
console.log("\n=== Render 免费实例 ===");
const rd = await grab("https://render.com/docs/free");
for (const kw of ["spin down", "750", "free instance", "15 minutes", "sleep"]) {
  const idx = rd.indexOf(kw);
  if (idx > -1) console.log(`  [${kw}] ...${rd.slice(Math.max(0, idx - 60), idx + 180).trim()}`);
}
