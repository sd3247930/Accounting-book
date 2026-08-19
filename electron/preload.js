/**
 * Preload 脚本：通过 contextBridge 向渲染进程暴露安全、白名单化的 API
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // 分类管理：列表 / 新增 / 改名 / 删除
  categories: {
    list: () => ipcRenderer.invoke('categories:list'),
    add: (payload) => ipcRenderer.invoke('categories:add', payload),
    update: (id, newName) => ipcRenderer.invoke('categories:update', id, newName),
    remove: (id) => ipcRenderer.invoke('categories:remove', id)
  },
  // 记账记录：新增 / 更新 / 删除 / 分页查询 / 统计 / 趋势 / 最近记录
  records: {
    add: (payload) => ipcRenderer.invoke('records:add', payload),
    update: (id, payload) => ipcRenderer.invoke('records:update', id, payload),
    remove: (id) => ipcRenderer.invoke('records:remove', id),
    list: (filters) => ipcRenderer.invoke('records:list', filters),
    stats: (month) => ipcRenderer.invoke('records:stats', month),
    trend: (months) => ipcRenderer.invoke('records:trend', months),
    recent: (limit) => ipcRenderer.invoke('records:recent', limit)
  },
  // 数据管理：导出 CSV/JSON、数据库路径、打开数据文件夹、清空记录
  data: {
    exportCSV: (filters) => ipcRenderer.invoke('data:exportCSV', filters),
    exportJSON: (filters) => ipcRenderer.invoke('data:exportJSON', filters),
    dbPath: () => ipcRenderer.invoke('data:dbPath'),
    openFolder: () => ipcRenderer.invoke('data:openFolder'),
    clearAll: () => ipcRenderer.invoke('data:clearAll')
  }
})
