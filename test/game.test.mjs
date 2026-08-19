/**
 * 2048 游戏核心逻辑单元测试（Node 内置 test runner）
 * 运行：node --test test/game.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as game from '../src/game2048/game.mjs'

// 用例：棋盘常量正确（标准 2048 为 4x4）
test('网格大小为 4x4，方向常量为 0/1/2/3', () => {
  assert.equal(game.SIZE, 4)
  assert.deepEqual(game.DIR, { UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3 })
})

// 用例：空网格全为 0，且是独立的新数组
test('emptyGrid 生成全 0 的 4x4 网格', () => {
  const g = game.emptyGrid()
  assert.equal(g.length, 4)
  for (const row of g) {
    assert.equal(row.length, 4)
    assert.deepEqual(row, [0, 0, 0, 0])
  }
})

// 用例：cloneGrid 是深拷贝，修改副本不影响原网格
test('cloneGrid 深拷贝，不共享行数组', () => {
  const g = [[2, 4, 8, 16], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]
  const c = game.cloneGrid(g)
  c[0][0] = 999
  assert.equal(g[0][0], 2)
  assert.notEqual(c, g)
})

// 用例：空网格有 16 个空格，满盘没有空格
test('emptyCells 统计空格数量与位置', () => {
  assert.equal(game.emptyCells(game.emptyGrid()).length, 16)
  const full = [[2, 4, 8, 16], [32, 64, 128, 256], [512, 1024, 2048, 4096], [8192, 16384, 32768, 65536]]
  assert.equal(game.emptyCells(full).length, 0)
  const g = [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]
  const cells = game.emptyCells(g)
  assert.equal(cells.length, 15)
  assert.deepEqual(cells[0], { r: 0, c: 1 })
})

// 用例：满盘时 addRandomTile 原样返回，不生成新块
test('addRandomTile 在满盘时不加块', () => {
  const full = [[2, 4, 8, 16], [32, 64, 128, 256], [512, 1024, 2048, 4096], [8192, 16384, 32768, 65536]]
  const res = game.addRandomTile(full)
  assert.equal(res, full) // 无空格时直接返回原网格
  assert.deepEqual(res, full)
})

// 用例：空格存在时 addRandomTile 恰好生成一个 2 或 4
test('addRandomTile 在空网格生成一个 2 或 4', () => {
  const res = game.addRandomTile(game.emptyGrid())
  const nonZero = res.flat().filter((v) => v !== 0)
  assert.equal(nonZero.length, 1)
  assert.ok([2, 4].includes(nonZero[0]))
})

// 用例：左移合并 [2,2,0,0] → [4,0,0,0]，得分 +4
test('左移合并两个 2，得分加 4', () => {
  const res = game.move(
    [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    game.DIR.LEFT
  )
  assert.deepEqual(res.grid, [[4, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
  assert.equal(res.gained, 4)
  assert.equal(res.moved, true)
})

// 用例：一行四个 2 只合并一次（[2,2,2,2] → [4,4,0,0]），符合 2048 单次合并规则
test('四个 2 左移只合并成两个 4，不连乘', () => {
  const res = game.move(
    [[2, 2, 2, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    game.DIR.LEFT
  )
  assert.deepEqual(res.grid, [[4, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
  assert.equal(res.gained, 8)
})

// 用例：左移 [2,2,4,0] 先合并 2+2 得 4，再与原有 4 不合并
test('左移时合并结果不与后续方块连锁合并', () => {
  const res = game.move(
    [[2, 2, 4, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    game.DIR.LEFT
  )
  assert.deepEqual(res.grid, [[4, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
  assert.equal(res.gained, 4)
})

// 用例：已经贴左的 [4,2,0,0] 再左移无变化
test('无法移动时 moved 为 false 且得分 0', () => {
  const g = [[4, 2, 0, 0], [8, 16, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]
  const res = game.move(g, game.DIR.LEFT)
  assert.equal(res.moved, false)
  assert.equal(res.gained, 0)
  assert.deepEqual(res.grid, g)
})

// 用例：右移 [0,0,2,2] → [0,0,0,4]
test('右移把两个 2 合并到最右侧', () => {
  const res = game.move(
    [[0, 0, 2, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    game.DIR.RIGHT
  )
  assert.deepEqual(res.grid, [[0, 0, 0, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
  assert.equal(res.gained, 4)
})

// 用例：右移 [2,0,0,2] 时先压缩再合并 → [0,0,0,4]
test('右移中间隔空的相同块会先压缩再合并', () => {
  const res = game.move(
    [[2, 0, 0, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    game.DIR.RIGHT
  )
  assert.deepEqual(res.grid, [[0, 0, 0, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
  assert.equal(res.gained, 4)
})

// 用例：上移按列合并（[2,2,4,0] 纵向 → 第 0 列 [4,4,0,0]）
test('上移按列压缩并合并', () => {
  const res = game.move(
    [[2, 0, 0, 0], [2, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0]],
    game.DIR.UP
  )
  assert.deepEqual(res.grid, [[4, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
  assert.equal(res.gained, 4)
})

// 用例：下移把块压到底部并合并
test('下移按列反向压缩并合并', () => {
  const res = game.move(
    [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [2, 0, 0, 0]],
    game.DIR.DOWN
  )
  assert.deepEqual(res.grid, [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [4, 0, 0, 0]])
  assert.equal(res.gained, 4)
})

// 用例：move 返回新网格，原网格不被修改
test('move 不修改传入的原始网格', () => {
  const g = [[2, 2, 0, 0], [4, 8, 16, 32], [0, 0, 0, 0], [0, 0, 0, 0]]
  const snapshot = JSON.stringify(g)
  game.move(g, game.DIR.LEFT)
  assert.equal(JSON.stringify(g), snapshot)
})

// 用例：canMove 判断可移动/可合并方向
test('canMove 识别可移动与不可移动方向', () => {
  // 只有左上角一个 2：只能向下/向右移动
  const g = [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]
  assert.equal(game.canMove(g, game.DIR.LEFT), false)
  assert.equal(game.canMove(g, game.DIR.UP), false)
  assert.equal(game.canMove(g, game.DIR.RIGHT), true)
  assert.equal(game.canMove(g, game.DIR.DOWN), true)
  // 有可合并的相邻块
  const m = [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]
  assert.equal(game.canMove(m, game.DIR.LEFT), true)
})

// 用例：满盘且无相邻相同块时游戏结束
test('isGameOver：满盘且无相邻相同块为 true', () => {
  const dead = [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]
  assert.equal(game.isGameOver(dead), true)
})

// 用例：还有空格或可合并块时游戏未结束
test('isGameOver：有空格或有合并机会为 false', () => {
  const withSpace = [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 0]]
  assert.equal(game.isGameOver(withSpace), false)
  const withMerge = [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 2, 4]]
  assert.equal(game.isGameOver(withMerge), false)
})

// 用例：hasWon 检测是否存在 >= 2048 的方块
test('hasWon 只在出现 2048 及以上时返回 true', () => {
  const won = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 2048]]
  assert.equal(game.hasWon(won), true)
  const notWon = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 1024]]
  assert.equal(game.hasWon(notWon), false)
})

// 用例：maxTile 返回网格最大方块值
test('maxTile 返回最大值，空网格为 0', () => {
  const g = [[2, 4, 8, 16], [32, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]
  assert.equal(game.maxTile(g), 32)
  assert.equal(game.maxTile(game.emptyGrid()), 0)
})

// 用例：newGame 生成两个初始块且分数为 0
test('newGame 生成两个初始块，分数为 0', () => {
  const { grid, score, over, won } = game.newGame()
  assert.equal(score, 0)
  assert.equal(over, false)
  assert.equal(won, false)
  const nonZero = grid.flat().filter((v) => v !== 0)
  assert.equal(nonZero.length, 2)
  for (const v of nonZero) assert.ok([2, 4].includes(v))
})
