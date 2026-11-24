// 补抓关键服务的详细页（docs/pricing 子页）
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const urls = [
  ["InstaBox 主页",       "https://instabox.sh/"],
  ["InstaBox docs",       "https://instabox.sh/docs"],
  ["Koyeb free",          "https://www.koyeb.com/docs/faqs/pricing"],
  ["Koyeb pricing",       "https://www.koyeb.com/pricing"],
  ["Fly.io free",         "https://fly.io/docs/about/pricing/"],
  ["Uppcoder",            "https://uppcoder.com/"],
  ["Gigalixir free",      "https://gigalixir.com/pricing"],
  ["Colab faq",           "https://research.google.com/colaboratory/faq.html"],
];

for (const [name, url] of urls) {
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 20000);
    const r = await fetch(url, { signal: ctl.signal, headers: { "user-agent": UA }, redirect: "follow" });
    clearTimeout(to);
    const html = await r.text();
    const txt = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    // 找额度相关句子
    const sentences = txt.split(/[.!?。]/).filter(s =>
      /vCPU|GiB|GB|memory|ram|free|免费|cart|card|credit/i.test(s) && s.length > 20 && s.length < 220
    ).slice(0, 4);
    console.log(`\n=== ${name} (${r.status}, ${txt.length} chars) ===`);
    sentences.forEach(s => console.log("  " + s.trim().slice(0, 160)));
    if (!sentences.length) console.log("  (无匹配内容) " + txt.slice(0, 160));
  } catch (e) {
    console.log(`\n=== ${name} FAIL: ${e.message.slice(0,50)}`);
  }
}
