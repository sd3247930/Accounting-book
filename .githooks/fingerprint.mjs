/**
 * 质量门禁共用工具：计算工作区指纹（treeFingerprint）。
 *
 * 被 pre-commit 钩子、Codex PreToolUse 钩子与 tester/quality-engineer 代理共用，
 * 保证“检查时”与“提交时”用的是同一套算法（指纹算法只实现这一份）。
 *
 * 直接运行：node fingerprint.mjs → 打印当前指纹
 * 模块导入：import { treeFingerprint } from './fingerprint.mjs'
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/** 仓库根目录 = .githooks 的上一级（本文件位于 <仓库根>/.githooks/） */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 在仓库根目录执行 git 命令并返回 stdout */
function git(args) {
  // stderr 静音：避免 core.autocrlf 的换行警告污染钩子输出
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
}

/**
 * 计算当前工作区指纹（与 git add 的暂存状态无关）：
 * 取“相对 HEAD 有变化的跟踪文件”与“未跟踪文件”的并集，
 * 对每个文件按 路径+内容 做 SHA-256。这样无论是否已 git add，
 * 只要工作区内容没变，指纹就相同；任何文件增删改都会改变指纹。
 * @returns {string} 形如 sha256:<64位十六进制>
 */
export function treeFingerprint() {
  const changed = [] // 相对 HEAD 有变化的跟踪文件
  try {
    const out = git(['diff', 'HEAD', '--name-only', '-z'])
    if (out) changed.push(...out.split('\0').filter(Boolean))
  } catch { /* 空仓库（无 HEAD）时忽略 */ }

  const untracked = [] // 未跟踪文件（忽略 .gitignore 已排除项）
  try {
    const out = git(['ls-files', '--others', '--exclude-standard', '-z'])
    if (out) untracked.push(...out.split('\0').filter(Boolean))
  } catch { /* 忽略 */ }

  const paths = [...new Set([...changed, ...untracked])].sort()
  const h = createHash('sha256')
  h.update('kpb-quality-gate-v2\n')
  for (const f of paths) {
    let content = ''
    try { content = fs.readFileSync(path.join(REPO_ROOT, f), 'utf8') } catch { content = '' }
    h.update(f).update('\0').update(content).update('\0')
  }
  return 'sha256:' + h.digest('hex')
}

// 直接运行时输出指纹（供 tester/quality-engineer 写通行证时调用）
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(treeFingerprint())
}
