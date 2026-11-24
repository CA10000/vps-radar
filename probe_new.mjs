const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const targets = [
  // ── 官方免费层页面 ──
  ["azure-free",        "https://azure.microsoft.com/en-us/pricing/free-services/"],
  ["ibm-free",          "https://www.ibm.com/cloud/free"],
  ["alibaba-free",      "https://www.alibabacloud.com/en/free"],
  ["tencent-free",      "https://cloud.tencent.com/act/free"],
  ["koyeb",             "https://www.koyeb.com/pricing"],
  ["neon",              "https://neon.com/pricing"],
  ["supabase",          "https://supabase.com/pricing"],
  ["turso",             "https://turso.tech/pricing"],
  ["upstash",           "https://upstash.com/pricing"],
  ["deno-deploy",       "https://deno.com/deploy/pricing"],
  ["netlify",           "https://www.netlify.com/pricing/"],
  ["cloudflare-pages",  "https://pages.cloudflare.com/"],
  ["github-codespaces", "https://github.com/features/codespaces"],
  ["gitpod",            "https://www.gitpod.io/pricing"],
  // ── 金矿级聚合仓库 ──
  ["free-for-dev-raw",  "https://raw.githubusercontent.com/ripienaar/free-for-dev/master/README.md"],
  ["awesome-selfhosted","https://raw.githubusercontent.com/awesome-selfhosted/awesome-selfhosted/master/README.md"],
];

for (const [name, url] of targets) {
  const t0 = Date.now();
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 20000);
    const r = await fetch(url, { signal: ctl.signal, headers: { "user-agent": UA }, redirect: "follow" });
    clearTimeout(to);
    const t = await r.text();
    const links = (t.match(/https?:\/\/[^\s)"'>]+/g) || []).length;
    const mdLinks = (t.match(/\[[^\]]+\]\(https?:\/\/[^)]+\)/g) || []).length;
    console.log(`${r.ok ? "OK " : "ERR"} ${String(r.status).padEnd(4)} ${String(t.length).padStart(8)}B links=${String(links).padStart(5)} md=${String(mdLinks).padStart(4)}  ${name}`);
  } catch (e) {
    console.log(`FAIL            ${name} -> ${e.message}`);
  }
}
