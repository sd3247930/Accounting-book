/**
 * 数据库层（SQLite）
 * - 使用 better-sqlite3，同步 API，性能足以支撑 1 万条记录的毫秒级查询
 * - 所有业务数据操作集中在主进程，渲染进程通过 IPC 调用
 */
const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')
const SEED = require('../shared/categories.json')

let db = null

/** 打开（或复用）数据库连接，并完成建表与分类初始化 */
function open(dbPath) {
  if (db) return db
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL') // 读写并发更好，崩溃恢复更安全
  db.pragma('foreign_keys = ON')
  migrate()
  seedCategories()
  return db
}

/** 建表：分类表 + 记录表 + 索引 */
function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER REFERENCES categories(id),   -- NULL 表示一级大类
      name      TEXT    NOT NULL,
      sort      INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS records (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      type        TEXT    NOT NULL CHECK (type IN ('expense', 'income')),
      amount      REAL    NOT NULL CHECK (amount > 0),
      category_id INTEGER NOT NULL REFERENCES categories(id),
      date        TEXT    NOT NULL,                  -- YYYY-MM-DD
      note        TEXT    NOT NULL DEFAULT '',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_records_date ON records(date);
    CREATE INDEX IF NOT EXISTS idx_records_cat  ON records(category_id);
  `)
}

/** 首次启动时写入预设分类（幂等） */
function seedCategories() {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM categories').get()
  if (c > 0) return
  const insert = db.prepare('INSERT INTO categories (parent_id, name, sort) VALUES (?, ?, ?)')
  const tx = db.transaction(() => {
    SEED.forEach((cat, i) => {
      const info = insert.run(null, cat.name, i)
      cat.subs.forEach((sub, j) => insert.run(info.lastInsertRowid, sub, j))
    })
  })
  tx()
}

/** 全部分类（渲染进程用它 + 本地元数据拼装展示） */
function listCategories() {
  return db.prepare('SELECT id, parent_id AS parentId, name FROM categories ORDER BY sort, id').all()
}

function getRecord(id) {
  return db
    .prepare(
      `SELECT r.id, r.type, r.amount, r.category_id AS categoryId, r.date, r.note,
              c.name AS categoryName, p.name AS parentName
         FROM records r
         JOIN categories c ON r.category_id = c.id
         JOIN categories p ON c.parent_id = p.id
        WHERE r.id = ?`
    )
    .get(id)
}

/** 新增记录，返回完整记录行 */
function addRecord({ type, amount, categoryId, date, note }) {
  const info = db
    .prepare('INSERT INTO records (type, amount, category_id, date, note) VALUES (?, ?, ?, ?, ?)')
    .run(type, amount, categoryId, date, note || '')
  return getRecord(info.lastInsertRowid)
}

/** 更新记录 */
function updateRecord(id, { type, amount, categoryId, date, note }) {
  db.prepare(
    'UPDATE records SET type = ?, amount = ?, category_id = ?, date = ?, note = ? WHERE id = ?'
  ).run(type, amount, categoryId, date, note || '', id)
  return getRecord(id)
}

/** 删除记录，返回是否删除成功 */
function deleteRecord(id) {
  return db.prepare('DELETE FROM records WHERE id = ?').run(id).changes > 0
}

/** 清空全部记录，返回删除条数 */
function clearAll() {
  return db.prepare('DELETE FROM records').run().changes
}

/**
 * 分页查询记录
 * @param {object} f { startDate, endDate, catId, keyword, type, page, pageSize }
 * catId 若为一级分类，自动包含其所有二级
 */
function listRecords(f = {}) {
  const { startDate, endDate, catId, keyword, type, page = 1, pageSize = 50 } = f
  const where = []
  const params = []

  if (startDate) { where.push('r.date >= ?'); params.push(startDate) }
  if (endDate) { where.push('r.date <= ?'); params.push(endDate) }
  if (catId) { where.push('(c.id = ? OR c.parent_id = ?)'); params.push(catId, catId) }
  if (keyword) { where.push('r.note LIKE ?'); params.push('%' + keyword + '%') }
  if (type && type !== 'all') { where.push('r.type = ?'); params.push(type) }

  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : ''
  const base =
    `FROM records r
     JOIN categories c ON r.category_id = c.id
     JOIN categories p ON c.parent_id = p.id
     ${whereSql}`

  const total = db.prepare(`SELECT COUNT(*) AS c ${base}`).get(...params).c
  const rows = db
    .prepare(
      `SELECT r.id, r.type, r.amount, r.date, r.note, r.category_id AS categoryId,
              c.name AS categoryName, p.name AS parentName
       ${base}
       ORDER BY r.date DESC, r.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)

  return { total, rows }
}

/** 最近记录（首页） */
function recentRecords(limit = 6) {
  return listRecords({ page: 1, pageSize: limit }).rows
}

/** 某月汇总：总支出/总收入/笔数 + 按一级分类聚合的支出 */
function monthStats(month) {
  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'expense' THEN amount END), 0) AS expense,
         COALESCE(SUM(CASE WHEN type = 'income'  THEN amount END), 0) AS income,
         COUNT(*) AS count
       FROM records
       WHERE substr(date, 1, 7) = ?`
    )
    .get(month)

  const byCategory = db
    .prepare(
      `SELECT p.id AS categoryId, p.name AS name, SUM(r.amount) AS amount
         FROM records r
         JOIN categories c ON r.category_id = c.id
         JOIN categories p ON c.parent_id = p.id
        WHERE r.type = 'expense' AND substr(r.date, 1, 7) = ?
        GROUP BY p.id, p.name
        ORDER BY amount DESC`
    )
    .all(month)

  return { ...totals, byCategory }
}

/** 近 N 个月收支趋势 */
function trendStats(months = 6) {
  const now = new Date()
  const stmt = db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount END), 0) AS expense,
       COALESCE(SUM(CASE WHEN type = 'income'  THEN amount END), 0) AS income
     FROM records
     WHERE substr(date, 1, 7) = ?`
  )
  const out = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const row = stmt.get(m)
    out.push({
      month: m,
      label: `${d.getMonth() + 1}月`,
      expense: row.expense,
      income: row.income
    })
  }
  return out
}

/** 导出 CSV（带 BOM，Excel 可直接打开；UTF-8 中文不乱码） */
function exportCSV(filePath, filters = {}) {
  const { rows } = listRecords({ ...filters, page: 1, pageSize: 1000000 })
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = ['日期,类型,一级分类,二级分类,金额,备注']
  rows.forEach((r) => {
    lines.push(
      [r.date, r.type === 'expense' ? '支出' : '收入', r.parentName, r.categoryName, r.amount.toFixed(2), r.note]
        .map(esc)
        .join(',')
    )
  })
  fs.writeFileSync(filePath, '\ufeff' + lines.join('\r\n'), 'utf8')
  return rows.length
}

/** 导出 JSON（结构化，便于迁移/备份） */
function exportJSON(filePath, filters = {}) {
  const { rows } = listRecords({ ...filters, page: 1, pageSize: 1000000 })
  const payload = rows.map((r) => ({
    id: r.id,
    type: r.type,
    amount: r.amount,
    date: r.date,
    category: r.parentName,
    subCategory: r.categoryName,
    note: r.note
  }))
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8')
  return payload.length
}

module.exports = {
  open,
  close,
  listCategories,
  addRecord,
  updateRecord,
  deleteRecord,
  clearAll,
  listRecords,
  recentRecords,
  monthStats,
  trendStats,
  exportCSV,
  exportJSON
}

/** 关闭数据库连接（测试/维护用；应用运行期保持打开即可） */
function close() {
  if (db) {
    db.close()
    db = null
  }
}
