/**
 * 分类展示元数据：按分类名关联 shared/categories.js 中的图标与颜色
 */
import raw from '../../shared/categories.json'

const meta = {}
raw.forEach((c) => { meta[c.name] = c })

export function catMeta(name) {
  return meta[name] || { emoji: '❔', bg: '#EFEDE7', color: '#9B9588' }
}

export default raw
