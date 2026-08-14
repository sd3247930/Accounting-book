/**
 * 2048 AI 算法（纯 JavaScript ESM 模块，无任何第三方依赖）
 *
 * 思路：
 * 1. 用启发式评估函数给任意局面打分：
 *    - 空格越多越好（生存空间大）
 *    - 相邻方块数值差异越小越好（“平滑”，易于继续合并）
 *    - 行/列越单调（大数靠边）越好
 *    - 最大方块在角落有额外奖励
 * 2. 对每个候选方向做“有限深度期望搜索”（expectimax 简化版）：
 *    模拟移动 → 按概率（90% 出 2、10% 出 4）枚举所有可能生成的新块
 *    → 继续搜索，最后用评估函数打分，取期望最高的方向。
 */
import * as game from './game.mjs'

  const { SIZE, DIR } = game
  export const DIRECTIONS = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT]

  /** 游戏结束时的惩罚分数（远低于任何正常局面） */
  export const LOSE_PENALTY = -1e6

  /** 新块概率：90% 出 2，10% 出 4 */
  const TILE2_PROB = 0.9

  /**
   * 评估一个局面的启发式得分（越大越好）。
   * 分数 = 空格奖励 + 平滑度奖励 + 单调性奖励 + 角落奖励
   */
  export function evaluate(grid) {
    let emptyScore = 0
    let smoothPenalty = 0
    let monoScore = 0
    let max = 0
    let maxR = -1
    let maxC = -1

    // 第一遍：统计空格、平滑度（相邻非零块的数值差）、最大块位置
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = grid[r][c]
        if (v === 0) {
          emptyScore += 1
          continue
        }
        if (v > max) {
          max = v
          maxR = r
          maxC = c
        }
        // 与右侧相邻块比较
        if (c + 1 < SIZE && grid[r][c + 1] !== 0) {
          smoothPenalty += Math.abs(log2(v) - log2(grid[r][c + 1]))
        }
        // 与下方相邻块比较
        if (r + 1 < SIZE && grid[r + 1][c] !== 0) {
          smoothPenalty += Math.abs(log2(v) - log2(grid[r + 1][c]))
        }
      }
    }

    // 单调性：每行从左到右、每列从上到下，期望大数靠右/靠下
    for (let r = 0; r < SIZE; r++) {
      monoScore += lineMonotonicity(grid[r])
    }
    for (let c = 0; c < SIZE; c++) {
      const col = []
      for (let r = 0; r < SIZE; r++) col.push(grid[r][c])
      monoScore += lineMonotonicity(col)
    }

    // 最大块在角落奖励（鼓励“把最大块钉在角落”）
    let cornerBonus = 0
    if (max > 0) {
      const isCorner =
        (maxR === 0 || maxR === SIZE - 1) && (maxC === 0 || maxC === SIZE - 1)
      const isEdge = maxR === 0 || maxR === SIZE - 1 || maxC === 0 || maxC === SIZE - 1
      if (isCorner) cornerBonus = 800
      else if (isEdge) cornerBonus = 300
    }

    return emptyScore * 120 - smoothPenalty * 18 + monoScore * 6 + cornerBonus + log2(max || 2) * 4
  }

  /** 计算一条线的单调性得分：相邻逆序对越多分越低 */
  function lineMonotonicity(line) {
    let score = 0
    for (let i = 1; i < SIZE; i++) {
      const a = line[i - 1]
      const b = line[i]
      if (a !== 0 && b !== 0) {
        const la = log2(a)
        const lb = log2(b)
        if (la > lb) score -= la - lb // 大数在前（逆序）扣分
        else score += (lb - la) * 0.2 // 正序小奖励
      }
    }
    return score
  }

  /** 取以 2 为底的对数，避免重复计算 */
  function log2(v) {
    return Math.log2(v)
  }

  /**
   * 期望搜索：模拟“生成新块”这一步。
   * 遍历当前所有空格，分别放入 2（概率 0.9）和 4（概率 0.1），
   * 求后续最佳移动得分的期望。深度用尽时直接评估。
   */
  function expectScore(grid, depth) {
    if (game.isGameOver(grid)) return LOSE_PENALTY
    if (depth <= 0) return evaluate(grid)

    // 深拷贝一次再模拟放块，避免修改调用方传入的网格（消除隐式副作用）
    grid = game.cloneGrid(grid)
    const cells = game.emptyCells(grid)
    let total = 0
    for (const { r, c } of cells) {
      grid[r][c] = 2
      total += TILE2_PROB * bestChildScore(grid, depth)
      grid[r][c] = 4
      total += (1 - TILE2_PROB) * bestChildScore(grid, depth)
      grid[r][c] = 0 // 恢复空格，继续模拟下一个位置
    }
    return cells.length > 0 ? total / cells.length : LOSE_PENALTY
  }

  /** 从当前局面出发，选择得分最高的移动方向并返回其得分 */
  function bestChildScore(grid, depth) {
    let best = LOSE_PENALTY
    for (const dir of DIRECTIONS) {
      if (!game.canMove(grid, dir)) continue
      const { grid: next, gained } = game.move(grid, dir)
      best = Math.max(best, gained + expectScore(next, depth - 1))
    }
    return best
  }

  /**
   * 返回当前局面的最佳移动方向（0=上、1=下、2=左、3=右），
   * 没有可移动方向时返回 -1。
   * @param {number[][]} grid 4x4 网格
   * @param {number} depth 搜索深度（默认 2，越大越强但越慢）
   */
  export function getBestMove(grid, depth = 2) {
    let bestDir = -1
    let bestScore = LOSE_PENALTY
    for (const dir of DIRECTIONS) {
      if (!game.canMove(grid, dir)) continue
      const { grid: next, gained } = game.move(grid, dir)
      const score = gained + expectScore(next, depth - 1)
      if (score > bestScore) {
        bestScore = score
        bestDir = dir
      }
    }
    return bestDir
  }

  /** 用 AI 完整玩一局，返回统计信息（供自测脚本与界面“AI 自我测试”使用） */
  export function playOne(depth = 2, maxSteps = 100000) {
    let { grid, score } = game.newGame()
    let steps = 0
    while (!game.isGameOver(grid) && steps < maxSteps) {
      const dir = getBestMove(grid, depth)
      if (dir < 0) break
      const res = game.move(grid, dir)
      if (!res.moved) break // 防御：理论上不会发生
      score += res.gained
      grid = game.addRandomTile(res.grid)
      steps++
    }
    return { score, maxTile: game.maxTile(grid), steps }
  }

  /**
   * 异步版完整玩一局：每走若干步让出主线程（await），
   * 供界面“AI 自我测试”使用，避免长时间阻塞界面。
   */
  export async function playOneAsync(depth = 2, yieldEvery = 50, maxSteps = 100000) {
    let { grid, score } = game.newGame()
    let steps = 0
    while (!game.isGameOver(grid) && steps < maxSteps) {
      const dir = getBestMove(grid, depth)
      if (dir < 0) break
      const res = game.move(grid, dir)
      if (!res.moved) break
      score += res.gained
      grid = game.addRandomTile(res.grid)
      steps++
      // 定期让出主线程，让界面能刷新、按钮能响应
      if (steps % yieldEvery === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    }
    return { score, maxTile: game.maxTile(grid), steps }
  }
