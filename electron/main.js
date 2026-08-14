/**
 * Electron 主进程
 * - 创建窗口、初始化数据库、注册 IPC（渲染进程不直接接触 Node/SQLite）
 * - --smoke-test：不弹窗，初始化数据库并做一轮读写，验证原生模块可用
 * - --boot-test ：隐藏窗口加载真实界面，验证 preload / 渲染进程 / IPC 全链路
 * - --shot-test ：加载真实界面并截取各页面截图（用于开发期预览）
 */
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const db = require('./db')

let mainWindow = null
const isDev = !!process.env.VITE_DEV_SERVER_URL
const isSmoke = process.argv.includes('--smoke-test')
const isBoot = process.argv.includes('--boot-test')
const isShot = process.argv.includes('--shot-test')

/** 数据库文件放在系统用户数据目录，卸载后自动清理，不污染项目目录 */
function dbPath() {
  return path.join(app.getPath('userData'), 'kunpeng.db')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: '鲲鹏记账',
    backgroundColor: '#F7F3E8',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // 渲染进程与 Node 隔离
      nodeIntegration: false,
      sandbox: false
    }
  })
  mainWindow.setMenuBarVisibility(false)

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
  mainWindow.on('closed', () => { mainWindow = null })
}

/** 注册所有 IPC 通道 */
function registerIpc() {
  ipcMain.handle('categories:list', () => db.listCategories())

  ipcMain.handle('records:add', (_e, payload) => db.addRecord(payload))
  ipcMain.handle('records:update', (_e, id, payload) => db.updateRecord(id, payload))
  ipcMain.handle('records:remove', (_e, id) => db.deleteRecord(id))
  ipcMain.handle('records:list', (_e, filters) => db.listRecords(filters || {}))
  ipcMain.handle('records:stats', (_e, month) => db.monthStats(month))
  ipcMain.handle('records:trend', (_e, months) => db.trendStats(months))
  ipcMain.handle('records:recent', (_e, limit) => db.recentRecords(limit))

  ipcMain.handle('data:exportCSV', async (_e, filters) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '导出 CSV',
      defaultPath: `鲲鹏记账_${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (canceled || !filePath) return { canceled: true }
    const count = db.exportCSV(filePath, filters || {})
    return { canceled: false, filePath, count }
  })

  ipcMain.handle('data:exportJSON', async (_e, filters) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '导出 JSON',
      defaultPath: `鲲鹏记账_${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (canceled || !filePath) return { canceled: true }
    const count = db.exportJSON(filePath, filters || {})
    return { canceled: false, filePath, count }
  })

  ipcMain.handle('data:dbPath', () => dbPath())
  ipcMain.handle('data:openFolder', async () => shell.openPath(path.dirname(dbPath())))
  ipcMain.handle('data:clearAll', () => db.clearAll())
}

/** 冒烟测试：验证 better-sqlite3 在 Electron 运行时可用 */
function runSmoke() {
  const smokePath = path.join(app.getPath('temp'), 'kunpeng-smoke.db')
  db.open(smokePath)
  const cats = db.listCategories()
  const leaf = cats.find((c) => c.parentId !== null)
  const added = db.addRecord({ type: 'expense', amount: 25, categoryId: leaf.id, date: '2026-08-14', note: 'smoke' })
  const stats = db.monthStats('2026-08')
  const trend = db.trendStats(3)
  const list = db.listRecords({ page: 1, pageSize: 10 })
  console.log(`[SMOKE] categories=${cats.length} addedId=${added.id} expense=${stats.expense} trend=${trend.length} total=${list.total}`)
  console.log('SMOKE_OK')
  app.exit(0)
}

/** 启动测试：隐藏窗口加载打包产物，验证渲染层与 IPC */
function runBootTest() {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  win.webContents.on('console-message', (_e, _level, message) => {
    if (String(message).includes('Error')) console.log('[renderer]', message)
  })
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    console.log(`BOOT_FAIL ${code} ${desc}`)
    app.exit(1)
  })
  win.webContents.once('did-finish-load', async () => {
    try {
      const res = await win.webContents.executeJavaScript(`(async () => {
        const cats = await window.api.categories.list()
        const stats = await window.api.records.stats('2026-08')
        return {
          hasApi: !!window.api,
          categories: cats.length,
          expense: stats.expense,
          appChildren: document.getElementById('app') ? document.getElementById('app').children.length : 0
        }
      })()`)
      console.log(`[BOOT] api=${res.hasApi} categories=${res.categories} expense=${res.expense} appChildren=${res.appChildren}`)
      console.log('BOOT_OK')
      app.exit(0)
    } catch (e) {
      console.log('BOOT_FAIL ' + e.message)
      app.exit(1)
    }
  })
  if (isDev) win.loadURL(process.env.VITE_DEV_SERVER_URL)
  else win.loadFile(path.join(__dirname, '../dist/index.html'))
}

/** 截图测试：加载打包产物，依次切换页面并保存 PNG 到 prototype/preview */
async function runShotTest() {
  const samplePath = path.join(app.getPath('temp'), 'kunpeng-shot.db')
  fs.rmSync(samplePath, { force: true })
  db.open(samplePath)
  seedSampleData()

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  })
  const outDir = path.join(__dirname, '../prototype/preview')
  fs.mkdirSync(outDir, { recursive: true })
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    console.log(`SHOT_FAIL ${code} ${desc}`)
    app.exit(1)
  })
  win.webContents.once('did-finish-load', async () => {
    try {
      await sleep(2500)
      const shot = async (name) => {
        const image = await win.webContents.capturePage()
        fs.writeFileSync(path.join(outDir, name), image.toPNG())
        console.log('saved ' + name)
      }
      await shot('app-dashboard.png')
      await win.webContents.executeJavaScript(`document.querySelector('.nav-item[data-view="add"]')?.click()`)
      await sleep(500)
      await shot('app-add.png')
      await win.webContents.executeJavaScript(`document.querySelector('.nav-item[data-view="list"]')?.click()`)
      await sleep(500)
      await shot('app-list.png')
      await win.webContents.executeJavaScript(`document.querySelector('.nav-item[data-view="stats"]')?.click()`)
      await sleep(500)
      await shot('app-stats.png')
      console.log('SHOT_OK')
      app.exit(0)
    } catch (e) {
      console.log('SHOT_FAIL ' + e.message)
      app.exit(1)
    }
  })
  win.loadFile(path.join(__dirname, '../dist/index.html'))
}

/** 为截图测试写入一批示例记录（仅用于预览，不污染真实数据） */
function seedSampleData() {
  const cats = db.listCategories()
  const sub = (parentName, subName) => {
    const p = cats.find((c) => c.parentId === null && c.name === parentName)
    const s = cats.find((c) => c.parentId === p.id && c.name === subName)
    return s.id
  }
  const sample = [
    ['expense', 25, sub('餐饮', '午餐'), '2026-08-14', '公司楼下面馆'],
    ['expense', 4, sub('交通', '公交地铁'), '2026-08-14', '通勤'],
    ['expense', 45, sub('娱乐', '电影/演出'), '2026-08-13', '和朋友看电影'],
    ['expense', 189, sub('购物', '服饰鞋包'), '2026-08-13', '夏季T恤'],
    ['expense', 56, sub('交通', '打车'), '2026-08-12', '去机场'],
    ['expense', 36.5, sub('医疗', '药品购买'), '2026-08-12', '感冒药'],
    ['expense', 50, sub('通讯', '话费充值'), '2026-08-11', ''],
    ['expense', 1500, sub('居住', '房租/房贷'), '2026-08-10', '8月房租'],
    ['expense', 220, sub('餐饮', '聚餐'), '2026-08-09', '同学聚会'],
    ['expense', 68, sub('教育', '书籍教材'), '2026-08-08', '技术书'],
    ['expense', 200, sub('人情', '红包礼金'), '2026-08-07', '同事结婚'],
    ['income', 3520, sub('其他', '杂项'), '2026-08-05', '本月收入'],
    ['expense', 12, sub('餐饮', '饮品'), '2026-08-05', '奶茶'],
    ['expense', 30, sub('娱乐', '游戏充值'), '2026-08-03', ''],
    ['expense', 88, sub('购物', '数码产品'), '2026-08-01', '数据线']
  ]
  const insert = db.addRecord
  sample.forEach(([type, amount, categoryId, date, note]) =>
    insert({ type, amount, categoryId, date, note })
  )
}

app.whenReady().then(() => {
  if (isSmoke) {
    runSmoke()
    return
  }
  if (isShot) {
    registerIpc()
    runShotTest()
    return
  }
  db.open(dbPath())
  registerIpc()
  if (isBoot) {
    runBootTest()
    return
  }
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
