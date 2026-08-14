/**
 * 2048 游戏核心逻辑（纯 JavaScript ESM 模块，无任何依赖）
 *
 * - 4x4 网格，数值为 0 表示空格
 * - 方向常量：0=上、1=下、2=左、3=右
 * - Vue 组件（Vite）与 Node.js 自测脚本均可直接 import
 */

  /** 网格边长（标准 2048 为 4x4） */
  export const SIZE = 4

  /** 方向常量 */
  export const DIR = { UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3 }

  /** 新建一个全 0 的 4x4 网格 */
  export function emptyGrid() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(0))
  }

  /** 深拷贝网格，避免改动原状态 */
  export function cloneGrid(grid) {
    return grid.map((row) => row.slice())
  }

  /** 返回所有空格位置 [{r,c}] */
  export function emptyCells(grid) {
    const cells = []
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c] === 0) cells.push({ r, c })
      }
    }
    return cells
  }

  /**
   * 在随机空格生成新块：90% 概率为 2，10% 概率为 4。
   * 返回新网格；无空格时原样返回。
   */
  export function addRandomTile(grid) {
    const cells = emptyCells(grid)
    if (cells.length === 0) return grid
    const pos = cells[Math.floor(Math.random() * cells.length)]
    const next = cloneGrid(grid)
    next[pos.r][pos.c] = Math.random() < 0.9 ? 2 : 4
    return next
  }

  /**
   * 对一维数组执行一次“压缩 + 合并”（单次合并规则）：
   * 去掉所有 0，相邻相同数值只合并一次（例如 [2,2,2,2] → [4,4,0,0]），
   * 返回合并得到的新分数增量。
   */
  function mergeLine(line) {
    const compact = line.filter((v) => v !== 0)
    const result = []
    let gained = 0
    for (let i = 0; i < compact.length; i++) {
      if (i + 1 < compact.length && compact[i] === compact[i + 1]) {
        const merged = compact[i] * 2
        result.push(merged)
        gained += merged
        i++ // 跳过已被合并的下一个数
      } else {
        result.push(compact[i])
      }
    }
    while (result.length < SIZE) result.push(0)
    return { line: result, gained }
  }

  /**
   * 按方向取出网格中的“行序列”：
   * - 上：按列从上到下；下：按列从下到上
   * - 左：按行从左到右；右：按行从右到左
   */
  function extractLines(grid, dir) {
    const lines = []
    for (let i = 0; i < SIZE; i++) {
      const line = []
      for (let j = 0; j < SIZE; j++) {
        switch (dir) {
          case DIR.UP:
            line.push(grid[j][i])
            break
          case DIR.DOWN:
            line.push(grid[SIZE - 1 - j][i])
            break
          case DIR.LEFT:
            line.push(grid[i][j])
            break
          case DIR.RIGHT:
            line.push(grid[i][SIZE - 1 - j])
            break
        }
      }
      lines.push(line)
    }
    return lines
  }

  /** 把处理后的行序列写回网格（extractLines 的逆操作） */
  function writeLines(grid, dir, lines) {
    const next = emptyGrid()
    for (let i = 0; i < SIZE; i++) {
      for (let j = 0; j < SIZE; j++) {
        const v = lines[i][j]
        switch (dir) {
          case DIR.UP:
            next[j][i] = v
            break
          case DIR.DOWN:
            next[SIZE - 1 - j][i] = v
            break
          case DIR.LEFT:
            next[i][j] = v
            break
          case DIR.RIGHT:
            next[i][SIZE - 1 - j] = v
            break
        }
      }
    }
    return next
  }

  /**
   * 判断一条“按移动方向排好序”的行是否真的能产生变化：
   * - 存在相邻相等（可以合并）
   * - 或压缩去零后与当前排列不同（有移动空间）
   */
  function lineCanMove(line) {
    const compact = line.filter((v) => v !== 0)
    // 存在可合并的相邻相等块
    for (let i = 0; i < compact.length - 1; i++) {
      if (compact[i] === compact[i + 1]) return true
    }
    // 压缩后补齐零，若与当前行不同说明能移动（例如 [4,2,0,0] 向左不能再动）
    for (let i = 0; i < SIZE; i++) {
      const target = i < compact.length ? compact[i] : 0
      if (line[i] !== target) return true
    }
    return false
  }

  /**
   * 判断网格能否向某个方向移动（有可移动/可合并的相邻块）。
   * 用于游戏结束判定和 AI 剪枝。
   */
  export function canMove(grid, dir) {
    const lines = extractLines(grid, dir)
    return lines.some(lineCanMove)
  }

  /**
   * 执行一次移动。
   * @returns {{grid: number[][], moved: boolean, gained: number}}
   */
  export function move(grid, dir) {
    const lines = extractLines(grid, dir)
    const newLines = []
    let moved = false
    let gained = 0
    for (const line of lines) {
      const { line: mergedLine, gained: g } = mergeLine(line)
      newLines.push(mergedLine)
      gained += g
      // 移动或合并发生，即视为“有变化”
      for (let i = 0; i < SIZE; i++) {
        if (line[i] !== mergedLine[i]) moved = true
      }
    }
    return { grid: writeLines(grid, dir, newLines), moved, gained }
  }

  /** 游戏是否结束：没有空格且四个方向都无法移动 */
  export function isGameOver(grid) {
    if (emptyCells(grid).length > 0) return false
    return !canMove(grid, DIR.UP) &&
      !canMove(grid, DIR.DOWN) &&
      !canMove(grid, DIR.LEFT) &&
      !canMove(grid, DIR.RIGHT)
  }

  /** 是否达成 2048（网格中存在 >= 2048 的方块） */
  export function hasWon(grid) {
    for (const row of grid) {
      for (const v of row) {
        if (v >= 2048) return true
      }
    }
    return false
  }

  /** 当前网格最大方块值 */
  export function maxTile(grid) {
    let max = 0
    for (const row of grid) {
      for (const v of row) {
        if (v > max) max = v
      }
    }
    return max
  }

  /** 初始化一局：网格全 0 后生成两个初始块 */
  export function newGame() {
    let grid = addRandomTile(emptyGrid())
    grid = addRandomTile(grid)
    return { grid, score: 0, over: false, won: false }
  }
