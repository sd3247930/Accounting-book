/**
 * Codex PreToolUse 钩子（质量门禁第二道防线）：
 * 拦截 Codex 发起的 git commit 命令，校验通行证后才放行。
 *
 * 输入：stdin 一行 JSON（含 tool_name、tool_input.command）
 * 行为：
 * - 非 git commit 命令 → 直接放行（exit 0，无输出）
 * - git commit 且通行证有效 → 放行
 * - git commit 且通行证无效 → 输出 deny JSON 拒绝
 */
import fs from 'node:fs'
import { checkGate } from '../../.githooks/gate.mjs'

/** 读取 stdin 的 JSON 输入 */
function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

function main() {
  let input = {}
  try {
    input = JSON.parse(readStdin())
  } catch {
    process.exit(0) // 解析失败不拦截，避免误伤正常流程
  }

  const toolName = String(input.tool_name || '')
  const command = String((input.tool_input && input.tool_input.command) || '')
  // 只拦截 git commit（含 --amend、-m 等变体），其它命令一律放行
  const isCommit = /\bgit\s+commit\b/.test(command)
  if (!isCommit) process.exit(0)

  const { ok, problems } = checkGate()
  if (ok) process.exit(0)

  console.log(JSON.stringify({
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: '质量门禁未通过：请先运行 gitcommit-agent 完成测试与质量检查。' + problems.join('；')
  }))
}

main()
