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
  ensureIncomeCategories() // 旧库升级时补齐“收入”分组及其来源分类（幂等）
  migrateIncomeRecords()   // 历史收入记录统一迁移到“收入/其他”（幂等）
  return db
}

/** 建表：分类表 + 记录表 + 索引 */
function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER REFERENCES categories(id),   -- NULL 表示一级大类
      name      TEXT    NOT NULL,
      sort      INTEGER NOT NULL DEFAULT 0,
      is_preset INTEGER NOT NULL DEFAULT 1           -- 1=系统预置，0=用户自定义
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
    CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
  `)
  // 旧版本升级：categories 表若已存在但没有 is_preset 列，则补列。
  // 存量数据默认全部标记为预置（1），保证老用户升级后预置分类保持只读。
  // 注意：is_preset 索引必须在补列之后再建，否则旧表会因列不存在而报错。
  const cols = db.prepare('PRAGMA table_info(categories)').all().map((c) => c.name)
  if (!cols.includes('is_preset')) {
    db.exec('ALTER TABLE categories ADD COLUMN is_preset INTEGER NOT NULL DEFAULT 1')
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_categories_preset ON categories(is_preset)')
}

/** 首次启动时写入预设分类（幂等） */
function seedCategories() {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM categories').get()
  if (c > 0) return
  const insert = db.prepare('INSERT INTO categories (parent_id, name, sort, is_preset) VALUES (?, ?, ?, 1)')
  const tx = db.transaction(() => {
    SEED.forEach((cat, i) => {
      const info = insert.run(null, cat.name, i)
      cat.subs.forEach((sub, j) => insert.run(info.lastInsertRowid, sub, j))
    })
  })
  tx()
}

/** 收入专属分类名（预置、只读），与支出分类体系隔离 */
const INCOME_GROUP = '收入'
const INCOME_SOURCES = ['工资', '奖金', '兼职', '投资收益', '红包', '其他']

/** 确保“收入”分组及其来源分类存在（旧库升级时补齐，幂等） */
function ensureIncomeCategories() {
  const group = db.prepare('SELECT * FROM categories WHERE parent_id IS NULL AND name = ?').get(INCOME_GROUP)
  if (group) return group
  // 排序号接在现有最大一级分类之后
  const { s } = db.prepare('SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM categories WHERE parent_id IS NULL').get()
  const tx = db.transaction(() => {
    const info = db.prepare('INSERT INTO categories (parent_id, name, sort, is_preset) VALUES (NULL, ?, ?, 1)').run(INCOME_GROUP, s)
    const insert = db.prepare('INSERT INTO categories (parent_id, name, sort, is_preset) VALUES (?, ?, ?, 1)')
    INCOME_SOURCES.forEach((name, j) => insert.run(info.lastInsertRowid, name, j))
  })
  tx()
  return db.prepare('SELECT * FROM categories WHERE parent_id IS NULL AND name = ?').get(INCOME_GROUP)
}

/** 历史收入记录迁移：旧版收入记录指向支出分类，统一改指“收入/其他”（幂等） */
function migrateIncomeRecords() {
  const group = ensureIncomeCategories()
  const other = db.prepare('SELECT id FROM categories WHERE parent_id = ? AND name = ?').get(group.id, '其他')
  const sourceIds = db.prepare('SELECT id FROM categories WHERE parent_id = ?').all(group.id).map((r) => r.id)
  if (!other || sourceIds.length === 0) return 0
  const ph = sourceIds.map(() => '?').join(',')
  const info = db
    .prepare(`UPDATE records SET category_id = ? WHERE type = 'income' AND category_id NOT IN (${ph})`)
    .run(other.id, ...sourceIds)
  return info.changes
}

/** 全部分类（渲染进程用它 + 本地元数据拼装展示） */
function listCategories() {
  return db.prepare('SELECT id, parent_id AS parentId, name, is_preset AS isPreset FROM categories ORDER BY sort, id').all()
}

/** 按 ID 取单个分类（含 isPreset 标记） */
function getCategory(id) {
  return db.prepare('SELECT id, parent_id AS parentId, name, is_preset AS isPreset FROM categories WHERE id = ?').get(id)
}

/** 同级重名检查（不区分大小写）；excludeId 用于修改时排除自身 */
function findDuplicateName(name, parentId, excludeId) {
  const base = 'SELECT id FROM categories WHERE LOWER(name) = LOWER(?) AND parent_id IS ?'
  const sql = excludeId == null ? base : base + ' AND id != ?'
  const params = excludeId == null ? [name, parentId ?? null] : [name, parentId ?? null, excludeId]
  return db.prepare(sql).get(...params)
}

/** 新增自定义分类：校验非空、同级不重名（不区分大小写），parent_id 为空表示一级分类 */
function addCategory({ name, parentId = null } = {}) {
  name = String(name ?? '').trim()
  if (!name) return { ok: false, error: '分类名称不能为空' }
  if (name.length > 20) return { ok: false, error: '分类名称不能超过 20 个字' }
  if (parentId != null && !getCategory(parentId)) return { ok: false, error: '上级分类不存在' }
  if (findDuplicateName(name, parentId)) return { ok: false, error: '同级下已存在同名分类' }

  // 排序号 = 同级最大值 + 1（parent_id IS ? 兼容 NULL=一级的写法）
  const { s } = db
    .prepare('SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM categories WHERE parent_id IS ?')
    .get(parentId ?? null)
  const info = db
    .prepare('INSERT INTO categories (parent_id, name, sort, is_preset) VALUES (?, ?, ?, 0)')
    .run(parentId ?? null, name, s)
  return { ok: true, data: getCategory(info.lastInsertRowid) }
}

/** 修改自定义分类名称；预置分类一律拒绝 */
function updateCategory(id, newName) {
  const row = getCategory(id)
  if (!row) return { ok: false, error: '分类不存在' }
  if (row.isPreset) return { ok: false, error: '预置分类不可修改' }
  newName = String(newName ?? '').trim()
  if (!newName) return { ok: false, error: '分类名称不能为空' }
  if (newName.length > 20) return { ok: false, error: '分类名称不能超过 20 个字' }
  if (findDuplicateName(newName, row.parentId, id)) return { ok: false, error: '同级下已存在同名分类' }
  db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(newName, id)
  return { ok: true, data: getCategory(id) }
}

/** 删除自定义分类：预置拒绝；被记录引用拒绝；删除一级时级联检查其下所有二级 */
function deleteCategory(id) {
  const row = getCategory(id)
  if (!row) return { ok: false, error: '分类不存在' }
  if (row.isPreset) return { ok: false, error: '预置分类不可删除' }

  if (row.parentId === null) {
    // 一级分类：找出被记录引用的二级子分类，任一被使用则整体拒绝并列出名称
    const usedChildren = db
      .prepare(
        `SELECT DISTINCT c.name AS name
           FROM records r JOIN categories c ON r.category_id = c.id
          WHERE c.parent_id = ?`
      )
      .all(id)
    if (usedChildren.length > 0) {
      const names = usedChildren.map((x) => x.name).join('、')
      return { ok: false, error: `该分类下有子分类已被使用，无法删除：${names}。请先修改相关记录的分类` }
    }
    // 防御：一级分类本身也不允许被记录直接引用
    if (db.prepare('SELECT 1 FROM records WHERE category_id = ?').get(id)) {
      return { ok: false, error: '该分类已被使用，请先修改相关记录的分类' }
    }
    // 事务删除：先删二级子分类，再删一级分类，避免留下孤儿数据
    const del = db.transaction(() => {
      db.prepare('DELETE FROM categories WHERE parent_id = ?').run(id)
      db.prepare('DELETE FROM categories WHERE id = ?').run(id)
    })
    del()
    return { ok: true, data: { id } }
  }

  // 二级分类：仅检查自身关联记录
  if (db.prepare('SELECT 1 FROM records WHERE category_id = ?').get(id)) {
    return { ok: false, error: '该分类已被使用，请先修改相关记录的分类' }
  }
  db.prepare('DELETE FROM categories WHERE id = ?').run(id)
  return { ok: true, data: { id } }
}

/** 按 ID 取单条记录，联表带出一级/二级分类名；不存在返回 undefined */
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

/**
 * 记录参数统一校验（数据层最后防线，UI 之外也生效）：
 * - 类型必须是 expense / income
 * - 金额必须是大于 0 的有限数字
 * - 分类必须存在，且必须是二级分类（一级分类不能直接挂记录，
 *   否则 listRecords/getRecord 的内连接查询会查不到，产生“幽灵记录”）
 */
function validateRecordInput({ type, amount, categoryId }) {
  if (!['expense', 'income'].includes(type)) {
    throw new Error('记录类型不合法')
  }
  const n = Number(amount)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('金额必须大于 0')
  }
  const cat = getCategory(categoryId)
  if (!cat) {
    throw new Error('所选分类不存在')
  }
  if (cat.parentId === null) {
    throw new Error('必须选择二级分类，不能直接使用一级分类')
  }
}

/** 新增记录，返回完整记录行 */
function addRecord({ type, amount, categoryId, date, note }) {
  validateRecordInput({ type, amount, categoryId })
  const info = db
    .prepare('INSERT INTO records (type, amount, category_id, date, note) VALUES (?, ?, ?, ?, ?)')
    .run(type, amount, categoryId, date, note || '')
  return getRecord(info.lastInsertRowid)
}

/** 更新记录 */
function updateRecord(id, { type, amount, categoryId, date, note }) {
  validateRecordInput({ type, amount, categoryId })
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
  if (keyword) {
    // 转义 LIKE 通配符（% _ \），避免搜索词被当作模式
    const kw = String(keyword).replace(/[%_\\]/g, (m) => '\\' + m)
    where.push("r.note LIKE ? ESCAPE '\\'")
    params.push('%' + kw + '%')
  }
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
         COALESCE(ROUND(SUM(CASE WHEN type = 'expense' THEN amount END), 2), 0) AS expense,
         COALESCE(ROUND(SUM(CASE WHEN type = 'income'  THEN amount END), 2), 0) AS income,
         COUNT(*) AS count
       FROM records
       WHERE substr(date, 1, 7) = ?`
    )
    .get(month)

  const byCategory = db
    .prepare(
      `SELECT p.id AS categoryId, p.name AS name, ROUND(SUM(r.amount), 2) AS amount
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
       COALESCE(ROUND(SUM(CASE WHEN type = 'expense' THEN amount END), 2), 0) AS expense,
       COALESCE(ROUND(SUM(CASE WHEN type = 'income'  THEN amount END), 2), 0) AS income
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
  getCategory,
  addCategory,
  updateCategory,
  deleteCategory,
  ensureIncomeCategories,
  migrateIncomeRecords,
  addRecord,
  getRecord,
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
