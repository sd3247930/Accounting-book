<template>
  <div class="g2048">
    <!-- 顶部：标题 + 分数 -->
    <div class="head">
      <div>
        <div class="title">2048</div>
        <div class="subtitle">休闲小游戏 · 本地最高分</div>
      </div>
      <div class="scores">
        <div class="score-box">
          <span class="score-label">得分</span>
          <span class="score-num">{{ score }}</span>
        </div>
        <div class="score-box">
          <span class="score-label">最高分</span>
          <span class="score-num">{{ best }}</span>
        </div>
      </div>
    </div>

    <!-- 按钮组 -->
    <div class="toolbar">
      <el-button type="primary" round size="small" @click="restart">↻ 重新开始</el-button>
      <el-button v-if="!aiRunning" type="success" round size="small" @click="startAI">🤖 AI 自动玩</el-button>
      <template v-else>
        <el-button type="warning" round size="small" @click="togglePause">
          {{ aiPaused ? '▶ 继续' : '⏸ 暂停' }}
        </el-button>
        <el-button type="danger" round size="small" @click="stopAI">⏹ 停止</el-button>
      </template>
      <el-button type="info" plain round size="small" :disabled="aiRunning || testing" @click="runSelfTest">
        🧪 AI 自我测试（10 局）
      </el-button>
    </div>

    <!-- AI / 测试状态提示 -->
    <div v-if="aiRunning" class="ai-status">
      <span class="dot"></span> AI 正在自动玩{{ aiPaused ? '（已暂停）' : '' }}…
    </div>
    <div v-if="testing" class="ai-status">
      <span class="dot testing"></span> AI 自我测试中，已跑 {{ testDone }}/10 局…
    </div>
    <div v-if="testResult" class="test-result">
      <b>自测结果：</b>10 局中 {{ testResult.pass }} 局达到 1024 分以上（成功率
      {{ testResult.rate }}%），最高分 {{ testResult.best }}，平均分 {{ testResult.avg }}。
    </div>

    <!-- 游戏网格 -->
    <div class="board" :class="{ dead: over }">
      <div v-for="(row, r) in grid" :key="r" class="g-row">
        <div
          v-for="(cell, c) in row"
          :key="c"
          class="g-cell"
          :class="tileClass(cell)"
        >
          {{ cell || '' }}
        </div>
      </div>
      <!-- 结束/胜利遮罩 -->
      <div v-if="over || won" class="overlay">
        <div class="overlay-text">{{ won ? '🎉 达成 2048！' : '游戏结束' }}</div>
        <el-button type="primary" round size="small" @click="restart">再来一局</el-button>
      </div>
    </div>

    <div class="hint">使用键盘 ↑ ↓ ← → 方向键移动 · 相同数字相撞会合并</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import * as game from '../game2048/game.mjs'
import * as ai from '../game2048/ai.mjs'

const BEST_KEY = 'kpb2048_best'
const AI_STEP_MS = 120 // AI 每一步的间隔（毫秒），控制节奏

/** 当前 4x4 网格 */
const grid = ref(game.emptyGrid())
/** 当前得分 */
const score = ref(0)
/** 最高分（localStorage 持久化） */
const best = ref(Number(localStorage.getItem(BEST_KEY) || 0))
/** 游戏是否结束 */
const over = ref(false)
/** 是否达成 2048 */
const won = ref(false)
/** AI 是否正在自动玩 */
const aiRunning = ref(false)
/** AI 是否暂停 */
const aiPaused = ref(false)
/** 是否正在自我测试 */
const testing = ref(false)
/** 自我测试已完成的局数 */
const testDone = ref(0)
/** 自我测试结果 */
const testResult = ref(null)

/** AI 定时器句柄 */
let aiTimer = null
/** 组件是否已卸载（用于取消后台自测循环） */
let disposed = false

/** 记录最高分并写回 localStorage */
function updateBest() {
  if (score.value > best.value) {
    best.value = score.value
    localStorage.setItem(BEST_KEY, String(best.value))
  }
}

/** 新开一局 */
function restart() {
  stopAI()
  const state = game.newGame()
  grid.value = state.grid
  score.value = 0
  over.value = false
  won.value = false
  testResult.value = null
}

/** 执行一步移动（手动或 AI 共用） */
function step(dir) {
  if (over.value || won.value) return
  const res = game.move(grid.value, dir)
  if (!res.moved) return // 该方向没有变化
  grid.value = game.addRandomTile(res.grid)
  score.value += res.gained
  updateBest()
  if (!game.hasWon(grid.value) && game.isGameOver(grid.value)) {
    over.value = true
  }
  if (game.hasWon(grid.value)) won.value = true
}

/** 手动键盘控制（AI 运行时忽略按键） */
function onKeydown(e) {
  if (aiRunning.value || testing.value) return
  const map = {
    ArrowUp: game.DIR.UP,
    ArrowDown: game.DIR.DOWN,
    ArrowLeft: game.DIR.LEFT,
    ArrowRight: game.DIR.RIGHT
  }
  const dir = map[e.key]
  if (dir !== undefined) {
    e.preventDefault()
    step(dir)
  }
}

/** 启动 AI 自动玩 */
function startAI() {
  if (over.value || won.value) restart()
  aiRunning.value = true
  aiPaused.value = false
  aiTimer = setInterval(() => {
    if (aiPaused.value) return
    // 游戏结束或达成 2048：自动停止，避免定时器空转
    if (over.value || won.value) {
      stopAI()
      return
    }
    const dir = ai.getBestMove(grid.value, 2)
    if (dir < 0) {
      stopAI()
      return
    }
    step(dir)
  }, AI_STEP_MS)
}

/** 暂停 / 继续 */
function togglePause() {
  aiPaused.value = !aiPaused.value
}

/** 停止 AI */
function stopAI() {
  if (aiTimer) {
    clearInterval(aiTimer)
    aiTimer = null
  }
  aiRunning.value = false
  aiPaused.value = false
}

/** AI 自我测试：后台连跑 10 局并统计达标率 */
async function runSelfTest() {
  if (testing.value) return
  testing.value = true
  testDone.value = 0
  testResult.value = null

  const total = 10
  let pass = 0
  let bestScore = 0
  let sum = 0

  for (let i = 0; i < total; i++) {
    if (disposed) return // 页面已切走，放弃剩余测试
    const res = await ai.playOneAsync(2) // 每局之间让出主线程，界面保持响应
    if (res.maxTile >= 1024) pass++
    if (res.score > bestScore) bestScore = res.score
    sum += res.score
    testDone.value = i + 1
    await new Promise((r) => setTimeout(r, 0))
  }

  testResult.value = {
    pass,
    rate: Math.round((pass / total) * 100),
    best: bestScore,
    avg: Math.round(sum / total)
  }
  testing.value = false
}

/** 方块配色：按数值返回 CSS 类名 */
function tileClass(v) {
  if (!v) return ''
  if (v >= 4096) return 'tile-super'
  return `tile-${v}`
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  restart() // 进入页面自动开一局
})

onBeforeUnmount(() => {
  disposed = true
  window.removeEventListener('keydown', onKeydown)
  stopAI()
})
</script>

<style scoped>
.g2048 {
  max-width: 560px;
  margin: 0 auto;
  padding: 18px 20px 30px;
  user-select: none;
}

/* 顶部标题与分数 */
.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 14px;
}
.title {
  font-size: 40px;
  font-weight: 800;
  color: var(--k-primary);
  line-height: 1;
}
.subtitle {
  font-size: 13px;
  color: var(--k-text3);
  margin-top: 4px;
}
.scores {
  display: flex;
  gap: 10px;
}
.score-box {
  min-width: 92px;
  padding: 8px 14px;
  border-radius: var(--k-radius-md);
  background: var(--k-primary-soft);
  text-align: center;
}
.score-label {
  display: block;
  font-size: 12px;
  color: var(--k-primary);
}
.score-num {
  font-family: var(--k-num);
  font-size: 22px;
  font-weight: 700;
  color: var(--k-primary-dark);
}

/* 按钮组与状态提示 */
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.ai-status {
  font-size: 13px;
  color: var(--k-success-text);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--k-success);
  animation: blink 1s infinite;
}
.dot.testing {
  background: var(--k-accent);
}
@keyframes blink {
  50% { opacity: 0.3; }
}
.test-result {
  font-size: 13px;
  color: var(--k-text2);
  background: var(--k-bg-side);
  border: 1px solid var(--k-divider);
  border-radius: var(--k-radius-md);
  padding: 8px 12px;
  margin-bottom: 12px;
}

/* 游戏网格 */
.board {
  position: relative;
  background: #bbada0;
  border-radius: 14px;
  padding: 8px;
  box-shadow: var(--k-shadow);
}
.g-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  /* 覆盖全局 .row 样式（记录列表用），避免污染棋盘布局 */
  padding: 0;
  border-bottom: none;
  align-items: stretch;
}
.g-row:last-child {
  margin-bottom: 0;
}
.g-cell {
  flex: 1;
  aspect-ratio: 1;
  border-radius: 8px;
  background: rgba(238, 228, 218, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
  font-weight: 800;
  font-family: var(--k-num);
  color: #776e65;
  transition: background 0.12s;
}

/* 经典 2048 方块配色 */
.tile-2 { background: #eee4da; color: #776e65; }
.tile-4 { background: #ede0c8; color: #776e65; }
.tile-8 { background: #f2b179; color: #fff; }
.tile-16 { background: #f59563; color: #fff; }
.tile-32 { background: #f67c5f; color: #fff; }
.tile-64 { background: #f65e3b; color: #fff; }
.tile-128 { background: #edcf72; color: #fff; font-size: 30px; }
.tile-256 { background: #edcc61; color: #fff; font-size: 30px; }
.tile-512 { background: #edc850; color: #fff; font-size: 30px; }
.tile-1024 { background: #edc53f; color: #fff; font-size: 22px; }
.tile-2048 { background: #edc22e; color: #fff; font-size: 22px; }
.tile-super { background: #3c3a32; color: #fff; font-size: 20px; }

/* 结束 / 胜利遮罩 */
.overlay {
  position: absolute;
  inset: 0;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
}
.overlay-text {
  font-size: 28px;
  font-weight: 800;
  color: var(--k-text1);
}

.hint {
  margin-top: 14px;
  text-align: center;
  font-size: 13px;
  color: var(--k-text3);
}
</style>
