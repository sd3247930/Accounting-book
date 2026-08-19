/**
 * 分类展示元数据：按分类名关联 shared/categories.js 中的图标与颜色
 */
import raw from '../../shared/categories.json' with { type: 'json' }

const meta = {}
raw.forEach((c) => {
  meta[c.name] = c
  // 二级分类本身没有图标/颜色，直接继承所属一级分类的展示样式
  c.subs.forEach((s) => { meta[s] = c })
})

// 自定义分类没有内置图标/颜色时，按名称哈希从这组色板取稳定配色
const FALLBACKS = [
  { emoji: '📌', bg: '#E8EBF6', color: '#4A5AA8' },
  { emoji: '🏷️', bg: '#FAF2D9', color: '#EECB7D' },
  { emoji: '🎯', bg: '#FADFDC', color: '#E75C5C' },
  { emoji: '🧩', bg: '#E8E0F4', color: '#B292E2' },
  { emoji: '⭐', bg: '#D8F0EC', color: '#1A8B81' },
  { emoji: '🎁', bg: '#FCE8F0', color: '#EC7FA8' }
]

/**
 * 取分类的展示元数据（图标/背景色/文字色）。
 * 优先返回内置分类的配置；未知分类（含用户自定义）按名称哈希
 * 从 FALLBACKS 色板取一个稳定配色，保证同名分类永远同色。
 * @param {string} name 分类名称（可传空/undefined，会安全落到兜底色板）
 * @returns {{emoji: string, bg: string, color: string}} 展示样式
 */
export function catMeta(name) {
  const hit = meta[name]
  if (hit) return hit
  let h = 0
  const s = String(name || '')
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.codePointAt(i)) >>> 0
  return FALLBACKS[h % FALLBACKS.length]
}

export default raw
