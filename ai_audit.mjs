// 用 AI 分析真实页面内容，判定注册门槛与额度
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const KEY = process.env.DEEPSEEK_API_KEY;
const BASE = "https://api.deepseek.com";

const targets = [
  ["InstaBox", "https://instabox.sh/"],
  ["Koyeb", "https://www.koyeb.com/pricing"],
  ["Fly.io", "https://fly.io/docs/about/pricing/"],
  ["Render", "https://render.com/pricing"],
  ["Oracle Cloud Free", "https://www.oracle.com/cloud/free/"],
  ["Cloudflare Workers", "https://developers.cloudflare.com/workers/platform/pricing/"],
  ["Deno Deploy", "https://deno.com/deploy/pricing"],
  ["Gitpod", "https://www.gitpod.io/pricing"],
  ["Supabase", "https://supabase.com/pricing"],
  ["Neon", "https://neon.com/pricing"],
  ["Upstash", "https://upstash.com/pricing"],
  ["Hugging Face", "https://huggingface.co/pricing"],
  ["Groq", "https://groq.com/pricing/"],
  ["Modal", "https://modal.com/pricing"],
  ["Google Colab", "https://colab.research.google.com/"],
  ["Kaggle", "https://www.kaggle.com/"],
  ["Backblaze B2", "https://www.backblaze.com/cloud-storage/pricing"],
  ["Cloudflare R2", "https://developers.cloudflare.com/r2/pricing/"],
  ["Gigalixir", "https://gigalixir.com/"],
  ["Uppcoder", "https://uppcoder.com/"],
];

const SYS = `你是「免费云服务」评估专家。用户会给你一个服务页面的正文摘录，你要判断它能否免费使用、门槛多高。

严格输出 JSON：
{
  "is_machine": true/false,   // 能否跑自己的程序（有shell/容器/部署能力）；纯API/存储/数据库=false
  "free_quota": "免费额度的具体数字（如 4vCPU/8GiB、10万请求/日、500MB数据库），尽量精确，抓不到写 未知",
  "need_card": "yes/no/unknown",       // 注册是否必须绑定信用卡
  "need_phone": "yes/no/unknown",      // 是否必须手机验证
  "persistent": "yes/no/limited",      // 是否持久运行 vs 会休眠/定时回收
  "difficulty": "容易/中等/困难",       // 上手难度（含中国用户可注册性）
  "note": "一句话说明（30字内，中文）"
}

注意：
- 一定要基于页面实际内容判断，不要凭印象
- 如果页面内容不足以下结论，对应字段填 unknown
- "is_machine" 的判断标准：能部署并运行自己的代码/服务即为 true；纯数据存储、纯 API 调用、纯静态托管为 false`;

async function aiAnalyze(name, text) {
  const r = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: SYS },
        { role: "user", content: `服务名：${name}\n\n页面正文摘录：\n${text.slice(0, 3500)}` },
      ],
      temperature: 0.1,
      max_tokens: 400,
      response_format: { type: "json_object" },
    }),
  });
  const j = await r.json();
  const raw = j.choices?.[0]?.message?.content || "{}";
  try {
    return JSON.parse(raw);
  } catch {
    return { note: "AI 解析失败" };
  }
}

const results = [];
console.log("═══════ 用 AI 分析真实页面 ═══════\n");

for (const [name, url] of targets) {
  let text = "";
  let ok = false;
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 18000);
    const r = await fetch(url, { signal: ctl.signal, headers: { "user-agent": UA }, redirect: "follow" });
    clearTimeout(to);
    const html = await r.text();
    text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    ok = r.ok;
  } catch (e) {
    text = "";
  }

  if (!ok || text.length < 200) {
    results.push({ name, url, reachable: false });
    console.log(`✗ ${name} —— 不可达或内容过少`);
    continue;
  }

  try {
    const a = await aiAnalyze(name, text);
    results.push({ name, url, reachable: true, ...a });
    console.log(
      `✓ ${name.padEnd(20)} 机器=${String(a.is_machine).padEnd(5)} 卡=${String(a.need_card).padEnd(7)} 额度=${(a.free_quota || "").slice(0, 34)}`
    );
  } catch (e) {
    results.push({ name, url, reachable: true, note: "AI 调用失败: " + e.message.slice(0, 40) });
    console.log(`✗ ${name} —— AI 失败`);
  }
  await new Promise((s) => setTimeout(s, 500));
}

await Bun.write("ai-free-audit.json", JSON.stringify(results, null, 2));
console.log(`\n结果已存: ai-free-audit.json`);
