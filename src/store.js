/**
 * 极简全局状态（无 Pinia 依赖，够用且直观）
 */
import { reactive } from 'vue'

/** 当前月份（YYYY-MM），用于仪表盘/统计页的默认统计口径 */
function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 极简全局状态：当前页面、搜索关键词、待编辑记录、当前月份 */
export const store = reactive({
  view: 'dashboard',
  searchKeyword: '',
  recordToEdit: null,
  month: currentMonth()
})

/**
 * 切换页面；进入明细页时可携带搜索关键词（顶部搜索框回车后跳转）。
 * 离开明细页时清空关键词，避免其它页面残留上一次搜索。
 */
export function go(view, keyword) {
  if (view === 'list' && keyword !== undefined) store.searchKeyword = keyword
  else if (view !== 'list') store.searchKeyword = ''
  store.view = view
}

/** 进入编辑模式：把要编辑的记录带进“记一笔”表单 */
export function editRecord(record) {
  store.recordToEdit = record
  store.view = 'add'
}
