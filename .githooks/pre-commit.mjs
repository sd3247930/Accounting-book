/**
 * pre-commit 钩子入口：提交前执行质量门禁检查。
 * 通过 → exit 0；不通过 → 打印中文原因并 exit 1（Git 据此拒绝提交）。
 */
import { checkGate } from './gate.mjs'

const { ok, problems, summaries } = checkGate()

if (ok) {
  console.log(`✅ 质量门禁通过：${summaries.join('，')}`)
  process.exit(0)
}

console.error('❌ 质量门禁未通过，提交已拦截：')
for (const p of problems) console.error('- ' + p)
console.error('请运行 gitcommit-agent 完成测试与质量检查后再提交。')
process.exit(1)
