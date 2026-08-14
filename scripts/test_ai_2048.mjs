/**
 * 2048 AI 自我测试脚本（Node.js 环境运行，无需界面）
 *
 * 用法：
 *   node scripts/test_ai_2048.mjs            # 默认跑 10 局
 *   node scripts/test_ai_2048.mjs 20         # 跑 20 局
 *   node scripts/test_ai_2048.mjs 10 3       # 跑 10 局，AI 搜索深度 3
 *
 * 验收基准：至少 1 局得分超过 1024。
 */
import * as game from '../src/game2048/game.mjs'
import * as ai from '../src/game2048/ai.mjs'

const games = Number(process.argv[2] || 10)
const depth = Number(process.argv[3] || 2)

const results = []
let passCount = 0
let totalScore = 0
let totalSteps = 0
const startedAt = Date.now()

for (let i = 0; i < games; i++) {
  const res = ai.playOne(depth)
  results.push(res)
  totalScore += res.score
  totalSteps += res.steps
  if (res.maxTile >= 1024) passCount++
  console.log(
    `第 ${String(i + 1).padStart(2)} 局：得分 ${String(res.score).padStart(6)}，` +
      `最大块 ${String(res.maxTile).padStart(5)}，步数 ${res.steps}`
  )
}

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
const best = results.reduce((a, b) => (b.score > a.score ? b : a), results[0])

console.log('----------------------------------------')
console.log(`共 ${games} 局 | 达到 1024 分以上：${passCount} 局（成功率 ${((passCount / games) * 100).toFixed(0)}%）`)
console.log(`最高分：${best.score}（最大块 ${best.maxTile}）| 平均分：${Math.round(totalScore / games)}`)
console.log(`平均步数：${Math.round(totalSteps / games)} | 耗时 ${elapsed}s（搜索深度 ${depth}）`)
console.log(passCount >= 1 ? '✅ 验收通过：AI 至少 1 局超过 1024 分' : '❌ 验收未通过：没有任何一局达到 1024 分')

process.exit(passCount >= 1 ? 0 : 1)
