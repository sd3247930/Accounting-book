/**
 * 2048 AI 算法单元测试（Node 内置 test runner）
 * 运行：node --test test/ai.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as game from '../src/game2048/game.mjs'
import * as ai from '../src/game2048/ai.mjs'

// 用例：AI 的候选方向与惩罚值符合预期
test('DIRECTIONS 覆盖四个方向，LOSE_PENALTY 为 -1e6', () => {
  assert.deepEqual(ai.DIRECTIONS, [0, 1, 2, 3])
  assert.equal(ai.LOSE_PENALTY, -1e6)
})

// 用例：空格越多，评估分数越高（生存空间大）
test('evaluate：空格多的局面得分更高', () => {
  const empty = game.emptyGrid()
  const full = [[2, 4, 8, 16], [32, 64, 128, 256], [512, 1024, 2048, 4096], [8192, 16384, 32768, 65536]]
  assert.ok(ai.evaluate(empty) > ai.evaluate(full))
})

// 用例：最大块在角落获得额外奖励，评分高于同局面居中摆放
test('evaluate：最大块在角落比在中间得分更高', () => {
  const corner = [[1024, 0, 0, 0], [0, 2, 4, 8], [0, 16, 32, 64], [0, 128, 256, 512]]
  const middle = [[0, 0, 0, 0], [1024, 2, 4, 8], [0, 16, 32, 64], [0, 128, 256, 512]]
  assert.ok(ai.evaluate(corner) > ai.evaluate(middle))
})

// 用例：满盘且四向都不可移动时，AI 返回 -1（无路可走）
test('getBestMove：无路可走时返回 -1', () => {
  const dead = [[2, 4, 8, 16], [32, 64, 128, 256], [512, 1024, 2048, 4096], [8192, 16384, 32768, 65536]]
  assert.equal(ai.getBestMove(dead), -1)
})

// 用例：只有一个合法方向时，AI 必然返回该方向（此处只能向下）
test('getBestMove：唯一合法方向时返回该方向', () => {
  const g = [[2, 4, 8, 16], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]
  assert.equal(ai.getBestMove(g), game.DIR.DOWN)
})

// 用例：AI 搜索不会修改传入的网格（消除隐式副作用）
test('getBestMove：不修改传入网格', () => {
  const g = [[2, 4, 8, 16], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]
  const before = JSON.stringify(g)
  const dir = ai.getBestMove(g)
  assert.ok([0, 1, 2, 3].includes(dir))
  assert.equal(JSON.stringify(g), before)
})

// 用例：AI 返回的移动方向必然合法（canMove 为 true）
test('getBestMove：返回的方向是可移动的', () => {
  const g = [[2, 2, 0, 0], [4, 8, 16, 32], [64, 128, 256, 512], [1024, 2048, 4096, 8192]]
  const dir = ai.getBestMove(g)
  assert.ok([0, 1, 2, 3].includes(dir))
  assert.equal(game.canMove(g, dir), true)
})

// 用例：AI 完整模拟一局返回合理统计（浅深度、限步数，保证测试快速）
test('playOne：返回非负分数与合法最大块', () => {
  const res = ai.playOne(1, 300)
  assert.equal(typeof res.score, 'number')
  assert.ok(res.score >= 0)
  assert.ok(res.maxTile >= 2)
  assert.ok(res.steps >= 0)
})

// 用例：异步版 AI 模拟一局可正常完成
test('playOneAsync：异步模拟可正常结束并返回统计', async () => {
  const res = await ai.playOneAsync(1, 5, 200)
  assert.equal(typeof res.score, 'number')
  assert.ok(res.score >= 0)
  assert.ok(res.maxTile >= 2)
  assert.ok(res.steps >= 0)
})
