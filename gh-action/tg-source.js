// 解析 Telegram 公开频道网页版 (t.me/s/xxx)
// 无需登录，无 API key
import { stripHtml } from "./fetcher.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function fetchTelegramChannel(channel, { limit = 30 } = {}) {
  const url = `https://t.me/s/${channel}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25000);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      headers: { "user-agent": UA, accept: "text/html" },
      redirect: "follow",
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}`, items: [] };
    const html = await r.text();

    // Telegram 网页版的每条消息是 <div class="tgme_widget_message_wrap">
    const blocks = html.split(/class="tgme_widget_message_wrap/).slice(1);
    const items = [];

    for (const b of blocks) {
      // 正文
      const textM = b.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
      if (!textM) continue;
      const text = stripHtml(textM[1]);
      if (!text || text.length < 8) continue;

      // 消息链接
      const linkM = b.match(/data-post="([^"]+)"/);
      const link = linkM ? `https://t.me/${linkM[1]}` : url;

      // 时间
      const timeM = b.match(/<time[^>]+datetime="([^"]+)"/);
      const publishedAt = timeM ? new Date(timeM[1]).toISOString() : null;

      // 取首行作标题
      const firstLine = text.split(/[\n。！？]/)[0].trim();
      const title = firstLine.length > 8 ? firstLine.slice(0, 100) : text.slice(0, 100);

      items.push({
        title,
        url: link,
        summary: text.slice(0, 500),
        publishedAt,
        extra: { channel },
      });
    }

    return { ok: true, error: null, items: items.slice(-limit).reverse() };
  } catch (e) {
    return { ok: false, error: e.name === "AbortError" ? "超时" : e.message, items: [] };
  } finally {
    clearTimeout(timer);
  }
}
