const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// 备选替代源
const tests = [
  ["hostloc-alternate", "https://hostloc.com/forum.php?mod=guide&view=newthread&rss=1"],
  ["v2ex-free", "https://www.v2ex.com/feed/tab/tech.xml"],
  ["v2ex-all", "https://www.v2ex.com/index.xml"],
  ["github-trending-actions", "https://api.github.com/search/repositories?q=free+server+in:readme&sort=stars&order=desc&per_page=15"],
  ["github-new-free", "https://api.github.com/search/repositories?q=topic:free-tier&sort=updated&per_page=15"],
  ["hn-free-hosting", "https://hn.algolia.com/api/v1/search_by_date?query=free%20hosting&tags=story&hitsPerPage=20"],
  ["devto-free", "https://dev.to/feed/tag/free"],
  ["lobsters", "https://lobste.rs/rss"],
];

for (const [name, url] of tests) {
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 18000);
    const r = await fetch(url, { signal: ctl.signal, headers: { "user-agent": UA, accept: "*/*" }, redirect: "follow" });
    clearTimeout(to);
    const t = await r.text();
    const items = (t.match(/<item>/g) || []).length + (t.match(/<entry>/g) || []).length;
    let ghItems = 0;
    try { ghItems = (JSON.parse(t).items || []).length; } catch {}
    let hnItems = 0;
    try { hnItems = (JSON.parse(t).hits || []).length; } catch {}
    console.log(`${r.ok ? "OK " : "ERR"} ${String(r.status).padEnd(4)} ${String(t.length).padStart(8)}B rss=${items} gh=${ghItems} hn=${hnItems}  ${name}`);
  } catch (e) {
    console.log(`FAIL            ${name} -> ${e.message}`);
  }
}
