const UA = "Mozilla/5.0";
const r = await fetch("https://raw.githubusercontent.com/ripienaar/free-for-dev/master/README.md", {
  headers: { "user-agent": UA },
});
const md = await r.text();

// 按 ## 切分章节
const sections = md.split(/^##\s+/m).slice(1);
const wanted = ["Major Cloud Providers", "IaaS", "PaaS", "Web Hosting", "Tunneling"];

for (const sec of sections) {
  const title = sec.split("\n")[0].trim();
  if (!wanted.some((w) => title.toLowerCase().includes(w.toLowerCase()))) continue;
  console.log(`\n${"=".repeat(66)}\n## ${title}`);
  const items = sec
    .split("\n")
    .filter((l) => /^\s*[-*]\s+\[.+\]\(http/.test(l))
    .slice(0, 6);
  items.forEach((l) => console.log("  " + l.trim().slice(0, 200)));
}
