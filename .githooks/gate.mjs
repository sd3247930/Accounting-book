/**
 * 质量门禁校验核心：检查两张通行证（tester + quality）是否都有效。
 *
 * 通行证有效 = 文件存在 + status 为 pass + 指纹与当前工作区一致。
 * 被 pre-commit.mjs 与 Codex PreToolUse 钩子共用，保证两处判定一致。
 */
import fs from 'node:fs'
import path from 'node:path'
import { REPO_ROOT, treeFingerprint } from './fingerprint.mjs'

/** 通行证目录（已加入 .gitignore，不随提交传播） */
const GATE_DIR = path.join(REPO_ROOT, '.quality-gate')

/** 需要校验的两张通行证 */
const MARKERS = [
  { file: 'tester-pass.json', label: '单元测试通行证' },
  { file: 'quality-pass.json', label: '质量检查通行证' }
]

/** 读取并解析通行证 JSON；缺失或损坏返回 null */
function loadMarker(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(GATE_DIR, file), 'utf8'))
  } catch {
    return null
  }
}

/**
 * 校验全部通行证。
 * @returns {{ok: boolean, problems: string[], summaries: string[]}}
 *   ok=true 放行；ok=false 时 problems 给出每个失败原因（中文、可直接展示）
 */
export function checkGate() {
  const current = treeFingerprint()
  const problems = []
  const summaries = []
  for (const m of MARKERS) {
    const data = loadMarker(m.file)
    if (!data) {
      problems.push(`${m.label}（${m.file}）：缺失，请先运行 gitcommit-agent 完成测试与质量检查`)
      continue
    }
    if (data.status !== 'pass') {
      problems.push(`${m.label}（${m.file}）：状态为 ${data.status}，不是 pass`)
      continue
    }
    if (data.treeFingerprint !== current) {
      problems.push(`${m.label}（${m.file}）：指纹不匹配，检查后代码又发生了变化，请重新运行检查`)
      continue
    }
    summaries.push(`${m.label}${data.summary ? '（' + JSON.stringify(data.summary) + '）' : ''}`)
  }
  return { ok: problems.length === 0, problems, summaries }
}
