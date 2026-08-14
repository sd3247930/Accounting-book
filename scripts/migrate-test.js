/**
 * 旧库迁移测试（需在 Electron 中运行，因为 better-sqlite3 是为 Electron 编译的原生模块）
 * 用法：npx electron scripts/migrate-test.js
 *
 * 模拟 v1.0 旧库（categories 无 is_preset 列且已有数据）：
 * 1. 用旧建表 SQL 建一个临时库并写入 2 条分类
 * 2. 用新代码打开 → 应自动补 is_preset 列，存量行标记为预置（1）
 * 3. 应自动补齐“收入”分组及其 6 个来源分类（旧库没有收入体系）
 * 4. 验证迁移后可正常新增自定义分类
 */
const { app } = require('electron')
const Database = require('better-sqlite3')
const path = require('path')
const os = require('os')
const fs = require('fs')

const db = require('../electron/db')

app.whenReady().then(() => {
  const p = path.join(os.tmpdir(), 'kunpeng-migrate-test.db')
  ;[p, p + '-wal', p + '-shm'].forEach((x) => fs.rmSync(x, { force: true }))

  // 1) 模拟 v1.0 旧库结构（无 is_preset 列）
  const old = new Database(p)
  old.exec(`
    CREATE TABLE categories (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER REFERENCES categories(id),
      name      TEXT NOT NULL,
      sort      INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO categories (parent_id, name, sort) VALUES (NULL, '旧分类', 0);
    INSERT INTO categories (parent_id, name, sort) VALUES (1, '旧小类', 0);
  `)
  old.close()

  // 2) 新代码打开 → 自动迁移（先补列再建索引）
  db.open(p)
  const cats = db.listCategories()
  const oldRows = cats.filter((c) => c.id === 1 || c.id === 2)
  const okPreset = oldRows.length === 2 && oldRows.every((c) => c.isPreset === 1)
  const incomeGroup = cats.find((c) => c.parentId === null && c.name === '收入')
  const incomeOk = !!incomeGroup && cats.filter((c) => c.parentId === incomeGroup.id).length === 6

  // 3) 迁移后可正常新增自定义分类
  const add = db.addCategory({ name: '新分类', parentId: null })
  console.log('[MIGRATE] rows=', JSON.stringify(cats))
  console.log('[MIGRATE] oldRowsMarkedPreset=', okPreset ? 'PASS' : 'FAIL')
  console.log('[MIGRATE] incomeBackfilled=', incomeOk ? 'PASS' : 'FAIL')
  console.log('[MIGRATE] addAfterMigrate=', add.ok ? 'PASS' : 'FAIL')
  console.log(okPreset && incomeOk && add.ok ? 'MIGRATE_OK' : 'MIGRATE_FAIL')
  db.close()
  app.exit(okPreset && incomeOk && add.ok ? 0 : 1)
})
