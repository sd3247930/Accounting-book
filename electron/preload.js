/**
 * Preload 脚本：通过 contextBridge 向渲染进程暴露安全、白名单化的 API
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  categories: {
    list: () => ipcRenderer.invoke('categories:list')
  },
  records: {
    add: (payload) => ipcRenderer.invoke('records:add', payload),
    update: (id, payload) => ipcRenderer.invoke('records:update', id, payload),
    remove: (id) => ipcRenderer.invoke('records:remove', id),
    list: (filters) => ipcRenderer.invoke('records:list', filters),
    stats: (month) => ipcRenderer.invoke('records:stats', month),
    trend: (months) => ipcRenderer.invoke('records:trend', months),
    recent: (limit) => ipcRenderer.invoke('records:recent', limit)
  },
  data: {
    exportCSV: (filters) => ipcRenderer.invoke('data:exportCSV', filters),
    exportJSON: (filters) => ipcRenderer.invoke('data:exportJSON', filters),
    dbPath: () => ipcRenderer.invoke('data:dbPath'),
    openFolder: () => ipcRenderer.invoke('data:openFolder'),
    clearAll: () => ipcRenderer.invoke('data:clearAll')
  }
})
