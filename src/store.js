/**
 * 极简全局状态（无 Pinia 依赖，够用且直观）
 */
import { reactive } from 'vue'

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const store = reactive({
  view: 'dashboard',
  searchKeyword: '',
  recordToEdit: null,
  month: currentMonth()
})

/** 切换页面；进入明细页时可携带搜索关键词 */
export function go(view, keyword) {
  if (view === 'list' && keyword !== undefined) store.searchKeyword = keyword
  else if (view !== 'list') store.searchKeyword = ''
  store.view = view
}

/** 进入编辑模式 */
export function editRecord(record) {
  store.recordToEdit = record
  store.view = 'add'
}
