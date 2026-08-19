/**
 * 数据库层单元测试（依赖 better-sqlite3 的 Electron 原生编译版本）
 * 运行方式：electron test/db.test.js（或 npm run test:db）
 *
 * 使用系统临时目录中的独立数据库文件，测试结束后自动清理，
 * 不会触碰真实用户数据（%APPDATA%\鲲鹏记账\kunpeng.db）。
 */
const { app } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const assert = require('assert/strict')
const db = require('../electron/db')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpb-test-'))
const dbPath = path.join(tmpDir, 'kpb-unit-test.db')

const tests = []
function test(name, fn) {
  tests.push({ name, fn })
}

// 辅助：按名称与上级 ID 查找分类
function catByName(name, parentId) {
  return db.listCategories().find((c) => c.name === name && c.parentId === (parentId ?? null))
}

// 用例：打开数据库会建表并写入预置分类（含收入分组）
test('open：初始化建表并写入预置分类', () => {
  db.open(dbPath)
  const cats = db.listCategories()
  assert.ok(cats.length > 0)
  const income = catByName('收入')
  assert.ok(income, '应存在“收入”一级分类')
  assert.equal(income.isPreset, 1)
})

// 用例：重复 open 复用连接，不重复写入预置分类（幂等）
test('open：重复打开复用连接且不重复写入预置分类', () => {
  const before = db.listCategories().length
  db.open(dbPath)
  assert.equal(db.listCategories().length, before)
})

// 用例：新增分类的参数校验（空名称 / 超长 / 重名 / 上级不存在）
test('addCategory：非法参数均被拒绝', () => {
  assert.equal(db.addCategory().ok, false)
  assert.equal(db.addCategory({ name: '   ' }).ok, false)
  assert.equal(db.addCategory({ name: 'x'.repeat(21) }).ok, false)
  assert.equal(db.addCategory({ name: '餐饮' }).ok, false) // 一级重名
  assert.equal(db.addCategory({ name: '我的分类', parentId: 999999 }).ok, false)
})

// 用例：合法创建自定义一级/二级分类，且同级重名不区分大小写
test('addCategory：创建自定义分类并拒绝大小写重名', () => {
  const top = db.addCategory({ name: '宠物' })
  assert.equal(top.ok, true)
  const sub = db.addCategory({ name: '猫粮', parentId: top.data.id })
  assert.equal(sub.ok, true)
  assert.equal(sub.data.parentId, top.data.id)
  assert.equal(sub.data.isPreset, 0)
  const dup = db.addCategory({ name: '猫粮', parentId: top.data.id })
  assert.equal(dup.ok, false)
})

// 用例：预置分类不可修改，自定义分类可修改
test('updateCategory：预置拒绝修改，自定义可改名', () => {
  const preset = catByName('交通')
  assert.equal(db.updateCategory(preset.id, '新交通').ok, false)
  const custom = catByName('宠物')
  assert.equal(db.updateCategory(custom.id, '').ok, false)
  const ok = db.updateCategory(custom.id, '萌宠')
  assert.equal(ok.ok, true)
  assert.equal(db.getCategory(custom.id).name, '萌宠')
})

// 用例：预置分类与已被记录引用的分类拒绝删除
test('deleteCategory：预置与有记录引用的分类拒绝删除', () => {
  const preset = catByName('交通')
  assert.equal(db.deleteCategory(preset.id).ok, false)
  const top = catByName('萌宠')
  const sub = catByName('猫粮', top.id)
  const rec = db.addRecord({
    type: 'expense',
    amount: 10,
    categoryId: sub.id,
    date: '2026-08-01',
    note: '引用测试'
  })
  assert.ok(rec.id > 0)
  assert.equal(db.deleteCategory(sub.id).ok, false) // 二级被记录引用
  assert.equal(db.deleteCategory(top.id).ok, false) // 一级下有子分类被引用
})

// 用例：删除引用记录后，自定义分类可被删除
test('deleteCategory：解除引用后删除成功', () => {
  const top = catByName('萌宠')
  const sub = catByName('猫粮', top.id)
  const rows = db.listRecords({ keyword: '引用测试' }).rows
  const rec = rows.find((r) => r.categoryId === sub.id)
  assert.equal(db.deleteRecord(rec.id), true)
  assert.equal(db.deleteCategory(sub.id).ok, true)
  assert.equal(db.deleteCategory(top.id).ok, true)
  assert.equal(db.getCategory(top.id), undefined)
})

// 用例：新增记录的参数校验（类型 / 金额 / 分类）
test('addRecord：非法类型、非正金额、一级分类均被拒绝', () => {
  const breakfast = catByName('早餐', catByName('餐饮').id)
  assert.throws(() => db.addRecord({ type: 'transfer', amount: 10, categoryId: breakfast.id }), /记录类型不合法/)
  assert.throws(() => db.addRecord({ type: 'expense', amount: 0, categoryId: breakfast.id }), /金额必须大于 0/)
  assert.throws(() => db.addRecord({ type: 'expense', amount: -5, categoryId: breakfast.id }), /金额必须大于 0/)
  assert.throws(() => db.addRecord({ type: 'expense', amount: 'abc', categoryId: breakfast.id }), /金额必须大于 0/)
  assert.throws(() => db.addRecord({ type: 'expense', amount: 10, categoryId: 999999 }), /所选分类不存在/)
  const foodTop = catByName('餐饮')
  assert.throws(() => db.addRecord({ type: 'expense', amount: 10, categoryId: foodTop.id }), /必须选择二级分类/)
})

// 用例：记录新增后可按 ID 完整读回（含一级/二级分类名）
test('addRecord/getRecord：记录完整往返', () => {
  const breakfast = catByName('早餐', catByName('餐饮').id)
  const rec = db.addRecord({ type: 'expense', amount: 12.5, categoryId: breakfast.id, date: '2026-01-15', note: '包子豆浆' })
  const got = db.getRecord(rec.id)
  assert.equal(got.amount, 12.5)
  assert.equal(got.type, 'expense')
  assert.equal(got.categoryName, '早餐')
  assert.equal(got.parentName, '餐饮')
  assert.equal(got.date, '2026-01-15')
  assert.equal(got.note, '包子豆浆')
  assert.equal(db.getRecord(999999), undefined)
})

// 用例：更新记录后返回新数据，非法更新仍被拒绝
test('updateRecord：修改记录字段，非法输入抛错', () => {
  const breakfast = catByName('早餐', catByName('餐饮').id)
  const lunch = catByName('午餐', catByName('餐饮').id)
  const rec = db.addRecord({ type: 'expense', amount: 8, categoryId: breakfast.id, date: '2026-01-16', note: '原备注' })
  const updated = db.updateRecord(rec.id, {
    type: 'income',
    amount: 88.8,
    categoryId: lunch.id,
    date: '2026-01-17',
    note: '新备注'
  })
  assert.equal(updated.amount, 88.8)
  assert.equal(updated.type, 'income')
  assert.equal(updated.categoryName, '午餐')
  assert.equal(updated.note, '新备注')
  assert.throws(() => db.updateRecord(rec.id, { type: 'expense', amount: -1, categoryId: lunch.id }), /金额必须大于 0/)
})

// 用例：删除不存在的记录返回 false
test('deleteRecord：删除不存在记录返回 false', () => {
  assert.equal(db.deleteRecord(999999), false)
})

// 用例：分页查询支持日期范围 / 类型 / 一级分类 / 关键词转义
test('listRecords：多条件过滤与分页', () => {
  db.clearAll()
  const foodTop = catByName('餐饮')
  const breakfast = catByName('早餐', foodTop.id)
  const bus = catByName('公交地铁', catByName('交通').id)
  const salary = catByName('工资', catByName('收入').id)
  db.addRecord({ type: 'expense', amount: 10, categoryId: breakfast.id, date: '2026-02-01', note: '早餐 100% 优惠' })
  db.addRecord({ type: 'expense', amount: 20, categoryId: bus.id, date: '2026-02-05', note: '公交' })
  db.addRecord({ type: 'income', amount: 5000, categoryId: salary.id, date: '2026-02-10', note: '二月工资' })

  // 日期范围
  let r = db.listRecords({ startDate: '2026-02-02', endDate: '2026-02-09' })
  assert.equal(r.total, 1)
  assert.equal(r.rows[0].amount, 20)

  // 类型过滤
  r = db.listRecords({ type: 'income' })
  assert.equal(r.total, 1)
  assert.equal(r.rows[0].categoryName, '工资')

  // 一级分类自动包含其二级
  r = db.listRecords({ catId: foodTop.id })
  assert.equal(r.total, 1)
  assert.equal(r.rows[0].categoryName, '早餐')

  // LIKE 通配符转义：搜索“0%”只命中字面量，而不是“任意字符 + %”
  r = db.listRecords({ keyword: '0%' })
  assert.equal(r.total, 1)
  assert.equal(r.rows[0].note, '早餐 100% 优惠')

  // 分页
  r = db.listRecords({ page: 1, pageSize: 2 })
  assert.equal(r.rows.length, 2)
  assert.equal(r.total, 3)
  r = db.listRecords({ page: 2, pageSize: 2 })
  assert.equal(r.rows.length, 1)
})

// 用例：最近记录按日期倒序返回
test('recentRecords：按日期倒序返回最近记录', () => {
  const rows = db.recentRecords(2)
  assert.ok(rows.length >= 1 && rows.length <= 2)
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1].date >= rows[i].date)
  }
})

// 用例：月度汇总（总支出/总收入/笔数 + 一级分类聚合）
test('monthStats：月度收支汇总正确', () => {
  db.clearAll()
  const foodTop = catByName('餐饮')
  const breakfast = catByName('早餐', foodTop.id)
  const dinner = catByName('晚餐', foodTop.id)
  const salary = catByName('工资', catByName('收入').id)
  db.addRecord({ type: 'expense', amount: 10.5, categoryId: breakfast.id, date: '2026-03-01', note: '' })
  db.addRecord({ type: 'expense', amount: 20.5, categoryId: dinner.id, date: '2026-03-02', note: '' })
  db.addRecord({ type: 'income', amount: 3000, categoryId: salary.id, date: '2026-03-03', note: '' })
  const s = db.monthStats('2026-03')
  assert.equal(s.expense, 31)
  assert.equal(s.income, 3000)
  assert.equal(s.count, 3)
  assert.equal(s.byCategory.length, 1)
  assert.equal(s.byCategory[0].name, '餐饮')
  assert.equal(s.byCategory[0].amount, 31)
  const empty = db.monthStats('2026-12')
  assert.equal(empty.expense, 0)
  assert.equal(empty.income, 0)
  assert.equal(empty.count, 0)
})

// 用例：趋势统计返回近 N 个月的完整数据
test('trendStats：返回近 N 个月趋势', () => {
  const t = db.trendStats(3)
  assert.equal(t.length, 3)
  for (const row of t) {
    assert.ok(/^\d{4}-\d{2}$/.test(row.month))
    assert.equal(typeof row.expense, 'number')
    assert.equal(typeof row.income, 'number')
    assert.ok(row.label.includes('月'))
  }
})

// 用例：CSV 导出带 BOM、转义引号；JSON 导出结构完整
test('exportCSV/exportJSON：导出文件内容正确', () => {
  db.clearAll()
  const breakfast = catByName('早餐', catByName('餐饮').id)
  db.addRecord({ type: 'expense', amount: 66.6, categoryId: breakfast.id, date: '2026-04-01', note: '含"引号"备注' })

  const csvPath = path.join(tmpDir, 'out.csv')
  const n = db.exportCSV(csvPath)
  const csv = fs.readFileSync(csvPath, 'utf8')
  assert.equal(n, 1)
  assert.ok(csv.startsWith('\ufeff'), 'CSV 应带 UTF-8 BOM')
  assert.ok(csv.includes('日期,类型,一级分类,二级分类,金额,备注'))
  assert.ok(csv.includes('餐饮'))
  assert.ok(csv.includes('"含""引号""备注"'))

  const jsonPath = path.join(tmpDir, 'out.json')
  const j = db.exportJSON(jsonPath)
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  assert.equal(j, 1)
  assert.equal(data.length, 1)
  assert.equal(data[0].subCategory, '早餐')
  assert.equal(data[0].note, '含"引号"备注')
})

// 用例：历史收入记录统一迁移到“收入/其他”，且幂等
test('migrateIncomeRecords：收入记录迁移到收入/其他并幂等', () => {
  db.clearAll()
  const breakfast = catByName('早餐', catByName('餐饮').id)
  const rec = db.addRecord({ type: 'income', amount: 100, categoryId: breakfast.id, date: '2026-05-01', note: '旧收入' })
  const changed = db.migrateIncomeRecords()
  assert.ok(changed >= 1)
  const after = db.getRecord(rec.id)
  assert.equal(after.parentName, '收入')
  assert.equal(after.categoryName, '其他')
  assert.equal(db.migrateIncomeRecords(), 0) // 幂等：再次执行为 0
})

// 用例：清空记录返回删除条数，列表为空
test('clearAll：清空全部记录', () => {
  db.clearAll()
  assert.equal(db.listRecords().total, 0)
})

// 主流程：按顺序执行全部用例并汇总结果
app.whenReady().then(() => {
  let passed = 0
  const failures = []
  for (const t of tests) {
    try {
      t.fn()
      passed++
      console.log(`  ✅ ${t.name}`)
    } catch (err) {
      failures.push({ name: t.name, err })
      console.error(`  ❌ ${t.name}`)
      console.error(`     ${err.message}`)
    }
  }
  db.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
  console.log(`\n数据库层测试结果：通过 ${passed}/${tests.length}`)
  if (failures.length > 0) {
    for (const f of failures) {
      console.error(`失败用例：${f.name}`)
      console.error(f.err.stack)
    }
    app.exit(1)
  } else {
    app.exit(0)
  }
})
