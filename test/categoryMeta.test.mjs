/**
 * 分类展示元数据单元测试（Node 内置 test runner）
 * 运行：node --test test/categoryMeta.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import raw, { catMeta } from '../src/utils/categoryMeta.js'

// 用例：内置一级分类返回其展示元数据
test('catMeta：内置一级分类返回对应图标与颜色', () => {
  const m = catMeta('餐饮')
  assert.equal(m.name, '餐饮')
  assert.equal(m.emoji, '🍜')
  assert.equal(m.bg, '#FAF2D9')
  assert.equal(m.color, '#EECB7D')
})

// 用例：二级分类继承所属一级分类的展示样式
test('catMeta：二级分类继承一级分类样式', () => {
  const m = catMeta('早餐')
  assert.equal(m.name, '餐饮')
  assert.equal(m.emoji, '🍜')
  const m2 = catMeta('工资')
  assert.equal(m2.name, '收入')
  assert.equal(m2.emoji, '💰')
})

// 用例：未知分类返回稳定的兜底色板样式
test('catMeta：未知分类返回兜底样式且结果稳定', () => {
  const a = catMeta('完全不存在')
  const b = catMeta('完全不存在')
  assert.ok(a && typeof a === 'object')
  assert.ok('emoji' in a && 'bg' in a && 'color' in a)
  assert.deepEqual(a, b)
})

// 用例：空字符串 / undefined / null 也能安全返回兜底样式
test('catMeta：空名称与 undefined 不抛异常', () => {
  assert.ok(catMeta(''))
  assert.ok(catMeta(undefined))
  assert.ok(catMeta(null))
})

// 用例：默认导出的预置分类数据完整（12 个一级分类，每个含二级分类）
test('默认导出 12 个预置分类且结构完整', () => {
  assert.ok(Array.isArray(raw))
  assert.equal(raw.length, 12)
  const names = new Set()
  for (const c of raw) {
    assert.equal(typeof c.name, 'string')
    assert.equal(typeof c.emoji, 'string')
    assert.ok(Array.isArray(c.subs) && c.subs.length > 0)
    assert.ok(!names.has(c.name), `一级分类名称重复：${c.name}`)
    names.add(c.name)
  }
})
