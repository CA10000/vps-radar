import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { isRelevant } from "./filter.js";

const DB_PATH = join(import.meta.dir, "data", "radar.db");
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH, { create: true });

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  hash         TEXT NOT NULL UNIQUE,
  source_id    TEXT NOT NULL,
  source_name  TEXT NOT NULL,
  category     TEXT NOT NULL,
  title        TEXT NOT NULL,
  url          TEXT NOT NULL,
  summary      TEXT,
  published_at TEXT,
  found_at     TEXT NOT NULL DEFAULT (datetime('now')),
  is_read      INTEGER NOT NULL DEFAULT 0,
  is_saved     INTEGER NOT NULL DEFAULT 0,
  extra        TEXT
);

CREATE INDEX IF NOT EXISTS idx_cat     ON items(category);
CREATE INDEX IF NOT EXISTS idx_pub     ON items(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_found   ON items(found_at DESC);
CREATE INDEX IF NOT EXISTS idx_read    ON items(is_read);

CREATE TABLE IF NOT EXISTS runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  total_found INTEGER DEFAULT 0,
  total_new   INTEGER DEFAULT 0,
  detail      TEXT
);
`);

// ---------- AI 审核字段（向后兼容：已存在则跳过） ----------
const cols = db.prepare("PRAGMA table_info(items)").all().map((c) => c.name);
const addCol = (name, def) => {
  if (!cols.includes(name)) db.exec(`ALTER TABLE items ADD COLUMN ${name} ${def}`);
};
addCol("ai_status", "TEXT");        // pending | reviewed | failed
addCol("ai_is_server", "INTEGER");  // 1 是机器 / 0 是服务
addCol("ai_is_free", "INTEGER");    // 1 真免费 / 0 不是
addCol("ai_confidence", "INTEGER"); // 0-100
addCol("ai_real_free", "TEXT");     // 到底免费什么
addCol("ai_cost", "TEXT");          // 实际成本
addCol("ai_risks", "TEXT");         // 风险提示
addCol("ai_tag", "TEXT");           // 官方免费层/免费试用/低价促销...
addCol("ai_at", "TEXT");            // 审核时间
addCol("ai_tokens", "INTEGER");     // 消耗 token

db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_free ON items(ai_is_free);
         CREATE INDEX IF NOT EXISTS idx_ai_status ON items(ai_status);`);

// 稳定去重键：来源 + URL（URL 去掉追踪参数）
export function hashItem(sourceId, url) {
  let clean = url;
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|ref|fbclid|gclid|from)/i.test(k)) u.searchParams.delete(k);
    }
    clean = u.origin + u.pathname + (u.search ? u.search : "");
  } catch {}
  const raw = `${sourceId}|${clean}`;
  const h = new Bun.CryptoHasher("sha256");
  h.update(raw);
  return h.digest("hex");
}

export function saveItems(source, items) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO items
      (hash, source_id, source_name, category, title, url, summary, published_at, extra)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let inserted = 0;
  let skipped = 0;
  const tx = db.transaction(() => {
    for (const it of items) {
      if (!isRelevant(it, source.cat)) {
        skipped++;
        continue;
      }
      const r = stmt.run(
        hashItem(source.id, it.url),
        source.id,
        source.name,
        source.cat,
        it.title,
        it.url,
        it.summary || "",
        it.publishedAt || null,
        it.extra ? JSON.stringify(it.extra) : null
      );
      if (r.changes > 0) inserted++;
    }
  });
  tx();
  return { inserted, skipped };
}

export function startRun() {
  const r = db.prepare("INSERT INTO runs (started_at) VALUES (datetime('now'))").run();
  return r.lastInsertRowid;
}

export function finishRun(runId, found, added, detail) {
  db.prepare(
    "UPDATE runs SET finished_at = datetime('now'), total_found = ?, total_new = ?, detail = ? WHERE id = ?"
  ).run(found, added, JSON.stringify(detail), runId);
}

export function queryItems({ cat, q, limit = 200, onlyUnread = false, onlySaved = false, onlyFree = false }) {
  const where = [];
  const args = [];
  if (cat && cat !== "all") {
    where.push("category = ?");
    args.push(cat);
  }
  if (onlyUnread) where.push("is_read = 0");
  if (onlySaved) where.push("is_saved = 1");
  // 「真免费服务器」= 是机器 + 免费 + 置信度≥65
  if (onlyFree) where.push("ai_is_free = 1 AND ai_is_server = 1 AND ai_confidence >= 65");
  if (q) {
    where.push("(title LIKE ? OR summary LIKE ?)");
    args.push(`%${q}%`, `%${q}%`);
  }
  const sql = `
    SELECT * FROM items
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY COALESCE(published_at, found_at) DESC
    LIMIT ?
  `;
  args.push(limit);
  return db.prepare(sql).all(...args);
}

// ---------- AI 审核相关 ----------
export function getPendingForReview(limit = 40) {
  return db
    .prepare(
      `SELECT * FROM items
       WHERE (ai_status IS NULL OR ai_status = 'pending')
       ORDER BY COALESCE(published_at, found_at) DESC
       LIMIT ?`
    )
    .all(limit);
}

export function saveAiResult(id, r) {
  db.prepare(
    `UPDATE items SET
       ai_status = ?, ai_is_server = ?, ai_is_free = ?, ai_confidence = ?, ai_real_free = ?,
       ai_cost = ?, ai_risks = ?, ai_tag = ?, ai_at = datetime('now'), ai_tokens = ?
     WHERE id = ?`
  ).run(
    "reviewed",
    r.is_server ? 1 : 0,
    r.is_free ? 1 : 0,
    r.confidence ?? 0,
    r.real_free || "",
    r.cost || "",
    r.risks || "",
    r.category_tag || "",
    r.tokens || 0,
    id
  );
}

export function markAiFailed(id, err) {
  db.prepare(
    "UPDATE items SET ai_status = 'failed', ai_real_free = ?, ai_at = datetime('now') WHERE id = ?"
  ).run(String(err || "").slice(0, 200), id);
}

export function aiStats() {
  const g = (sql) => db.prepare(sql).get()?.c || 0;
  return {
    pending: g("SELECT COUNT(*) c FROM items WHERE ai_status IS NULL OR ai_status='pending'"),
    reviewed: g("SELECT COUNT(*) c FROM items WHERE ai_status='reviewed'"),
    free: g(
      "SELECT COUNT(*) c FROM items WHERE ai_is_free = 1 AND ai_is_server = 1 AND ai_confidence >= 65"
    ),
    notServer: g("SELECT COUNT(*) c FROM items WHERE ai_is_server = 0"),
    failed: g("SELECT COUNT(*) c FROM items WHERE ai_status='failed'"),
    tokens: db.prepare("SELECT COALESCE(SUM(ai_tokens),0) s FROM items").get()?.s || 0,
  };
}

export function stats() {
  const total = db.prepare("SELECT COUNT(*) c FROM items").get().c;
  const unread = db.prepare("SELECT COUNT(*) c FROM items WHERE is_read = 0").get().c;
  const saved = db.prepare("SELECT COUNT(*) c FROM items WHERE is_saved = 1").get().c;
  const byCat = db.prepare("SELECT category, COUNT(*) c FROM items GROUP BY category").all();
  const lastRun = db.prepare("SELECT * FROM runs ORDER BY id DESC LIMIT 1").get();
  return { total, unread, saved, byCat, lastRun };
}

export function markRead(id, read = 1) {
  db.prepare("UPDATE items SET is_read = ? WHERE id = ?").run(read ? 1 : 0, id);
}

export function toggleSave(id) {
  const cur = db.prepare("SELECT is_saved FROM items WHERE id = ?").get(id);
  const next = cur && cur.is_saved ? 0 : 1;
  db.prepare("UPDATE items SET is_saved = ? WHERE id = ?").run(next, id);
  return next;
}

export function markAllRead(cat) {
  if (cat && cat !== "all") {
    db.prepare("UPDATE items SET is_read = 1 WHERE category = ?").run(cat);
  } else {
    db.prepare("UPDATE items SET is_read = 1").run();
  }
}
