# 鲲鹏记账 代码质量审查报告

> 审查日期：2026-08-19
> 审查方式：人工通读全部核心源码 + 辅助脚本（单元测试、注释统计、安全模式扫描）
> 整体评分：**B（良好）** —— 无严重漏洞，存在若干需尽快修复的健壮性问题与待提升项

## 一、项目概览

| 项目 | 内容 |
| --- | --- |
| 名称 | 鲲鹏记账（KunPengBook）v1.3.0 |
| 技术栈 | Electron 37 + Vue 3 + Element Plus + ECharts + better-sqlite3（SQLite） |
| 审查文件 | electron/main.js、electron/preload.js、electron/db.js、shared/categories.json、src/ 下 7 个视图 + 3 个组件 + store + utils + game2048、vite.config.js、index.html |
| 测试基线 | 53/53 单元测试通过（game/ai/categoryMeta/db） |
| 安全基线 | 敏感信息扫描 0 命中；风险模式 7 处命中经人工复核均为安全固定片段或低风险 |
| 注释基线 | 整体注释比例 8.8%（目标约 30%，见下方 🟡-4） |

## 二、🔴 严重问题（必须修复）

未发现需要立即修复的严重漏洞或逻辑错误。

依据：SQL 全部参数化、无 XSS 写入点（无 v-html/innerHTML 渲染用户数据）、无硬编码凭据、Electron 隔离配置正确（contextIsolation 开启、nodeIntegration 关闭）、53 个单元测试全部通过。

## 三、🟡 建议优化

### 1. 真实错误被静默吞掉，用户会看到“假成功”（建议优先修复）

| 位置 | 问题 | 影响 |
| --- | --- | --- |
| [RecordsView.vue](src/views/RecordsView.vue:84) `removeRow` | `catch (e) { /* 用户取消 */ }` 把**所有**异常当取消处理 | 删除真的失败（数据库错误、IPC 异常）时用户仍收到“已删除”，数据其实还在 |
| [CategoriesView.vue](src/views/CategoriesView.vue:33) `addTop`/`addSub`/`edit`/`remove` | 同样把真实异常与“用户取消”混为一谈 | 改名/删除失败时不提示，操作“无声失败” |

修复建议：区分取消与真实错误，参考 [DataView.vue](src/views/DataView.vue:23) 已写对的写法：

```js
catch (e) {
  if (e === 'cancel' || (e && e.message === 'cancel')) return // 用户取消
  ElMessage.error('操作失败：' + (e && e.message ? e.message : e))  // 真实错误要提示
}
```

### 2. 数据层缺少日期格式校验（违背“数据层最后防线”）

[db.js](electron/db.js:217) `validateRecordInput` 只校验类型/金额/分类，**没有校验 date**；`addRecord`（235 行）与 `updateRecord`（244 行）可写入 `'abc'`、`'2026-13-99'` 等非法日期，直接破坏月度统计与日期过滤。

修复建议：在 `validateRecordInput` 中增加日期校验：

```js
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
if (date && !DATE_RE.test(String(date))) throw new Error('日期格式必须为 YYYY-MM-DD')
```

### 3. updateRecord 对不存在的记录静默返回 undefined

[db.js](electron/db.js:244)：id 不存在时 `UPDATE` 影响 0 行，随后 `getRecord(id)` 返回 `undefined` 且不报错，渲染层可能把失败当成功。

修复建议：UPDATE 后检查 `info.changes === 0` 时抛错或返回 `{ ok: false, error: '记录不存在' }`。

### 4. IPC 未校验调用方 + 清空通道无二次防线

[main.js](electron/main.js:67) 全部 `ipcMain.handle` 未校验 `event.senderFrame`；其中 `data:clearAll`（101 行）是破坏性操作，任何能执行脚本的渲染内容都可直接清空全部记录。本地单窗口应用风险低，但属于标准加固项。

修复建议：
- 在 `ipcSafe` 中校验 `event.senderFrame.url` 属于应用自身页面（`file://` 的 dist 路径或开发服务器地址）。
- 对 `clearAll` 要求渲染层显式传 `{ confirm: true }` 之类标记。

### 5. 缺少单实例锁（双开可能冲突）

未调用 `app.requestSingleInstanceLock()`：用户双开时两个进程同时读写同一个 SQLite（WAL 模式），可能出现 `SQLITE_BUSY` 或数据竞争。修复：`app.whenReady` 前加单实例锁，第二实例启动时聚焦已有窗口并退出。

### 6. index.html 缺少 CSP（内容安全策略）

[index.html](index.html) 未配置 Content-Security-Policy，Electron 启动会在控制台告警；若未来加载远程资源，风险上升。修复：增加 CSP meta，例如 `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`。

### 7. 注释覆盖率整体 8.8%，明显低于项目目标（约 30%）

comments-check 脚本实测：Vue 视图层多数文件 0%–3%（如 AddView 2.4%、RecordsView 0%、DashboardView 0%、CategoriesView 3.2%），electron/main.js 5.5%、db.js 12.7%；仅 game2048 模块 24% 合格。核心视图方法（load/save/removeRow/clearAll 等）与主进程函数缺少“为什么这样写”的注释。

修复建议：优先给各视图的 `load`/`save`/`removeRow`、db.js 的 `validateRecordInput`、main.js 的 `ipcSafe` 等关键函数补中文注释（可用 comments-check 技能复查）。

### 8. 打包体积偏大（构建产物 2.09MB / gzip 690KB）

[ChartBox.vue](src/components/ChartBox.vue:5) 全量 `import * as echarts`，[main.js](src/main.js) 全量注册 Element Plus；`vite build` 出现 chunk > 500KB 警告。修复：echarts 改用 `echarts/core` 按需注册（饼图/柱状图组件），Element Plus 用 `unplugin-vue-components` + `unplugin-auto-import` 按需引入。

### 9. DashboardView 与 StatsView 存在明显重复代码

两处的 `donutOption` / `barOption` / `maxIdx` ECharts 配置与模板几乎相同（[DashboardView.vue](src/views/DashboardView.vue:35)、[StatsView.vue](src/views/StatsView.vue:22)）。修复：抽取 `src/composables/useStatsCharts.js` 共享图表配置。

### 10. main.js 混入测试脚本（低优先级）

`runSmoke`/`runBootTest`/`runShotTest`/`seedSampleData` 与主进程业务逻辑同文件（main.js 共 330 行）。可拆到 `scripts/` 目录，主进程只保留窗口与 IPC。

### 11. 其它小项

- [App.vue](src/App.vue:51) 硬编码 `v1.3.0`，升级版本时容易漏改（可用构建时注入）。
- RecordsView 的搜索关键字 watch 每次按键即触发查询，建议加 300ms 防抖。
- 导出默认文件名用 `toISOString()`（UTC 日期），在中国时区可能比本地日期早一天，建议用本地日期。
- 部分视图 `onMounted` 的异步加载没有 try/catch（AddView、DataView、CategoriesView），IPC 失败会变成未处理的 Promise rejection。

## 四、🟢 优点与亮点

- **SQL 全部参数化**：db.js 所有查询经 `prepare()` + 绑定参数，`LIKE` 通配符做了转义，没有注入风险。
- **Electron 安全基线正确**：`contextIsolation: true`、`nodeIntegration: false`，preload 只暴露白名单化最小 API，无整包透传。
- **统一 IPC 错误包装**：`ipcSafe` 把底层异常转成中文 Error，渲染层可直接展示。
- **测试体系扎实**：53 个单元测试覆盖游戏逻辑、AI、分类元数据与数据库层；另有 smoke/boot/shot 三个自动化验收脚本；数据库测试用临时文件，不污染真实数据。
- **分类保护完整**：预置分类只读、被记录引用的分类禁删、一级分类级联检查，事务删除避免孤儿数据。
- **生命周期清理到位**：Game2048View 在 `onBeforeUnmount` 清理键盘监听与 AI 定时器。
- **数据库索引齐全**：date、category_id、parent_id、is_preset 均有索引。
- **收入/支出体系隔离**：收入来源与支出分类分离，历史收入迁移幂等，边界处理细致。

## 五、综合评价与后续建议（技术债优先级排序）

| 优先级 | 事项 | 对应条目 |
| --- | --- | --- |
| P0 尽快 | 修复错误被吞掉（假成功） | 🟡-1 |
| P0 尽快 | 数据层日期校验 | 🟡-2 |
| P0 尽快 | updateRecord 存在性检查 | 🟡-3 |
| P1 建议 | IPC sender 校验 + clearAll 二次防线 | 🟡-4 |
| P1 建议 | 单实例锁 | 🟡-5 |
| P1 建议 | 增加 CSP | 🟡-6 |
| P2 提升 | 补齐关键函数注释（8.8% → 30%） | 🟡-7 |
| P2 提升 | 按需引入 echarts / Element Plus 减小体积 | 🟡-8 |
| P2 提升 | 抽取重复图表逻辑、拆分 main.js | 🟡-9 / 10 |

总体判断：工程结构清晰、数据层严谨、测试覆盖好，属于**可交付的 B 级质量**。最值得马上处理的是“错误静默吞掉”和“数据层日期/存在性校验”这两类健壮性问题，它们不制造安全漏洞，但会让用户在操作失败时被误导。

## 六、术语通俗解释

| 术语 | 通俗解释 |
| --- | --- |
| 参数化查询 | 把用户输入当作“数据”而不是“命令”传给数据库，从原理上杜绝 SQL 注入 |
| IPC | 界面（渲染进程）与后台（主进程）之间传话的通道 |
| contextIsolation | 把网页环境与 Node 环境隔开，网页被攻破也拿不到系统权限 |
| CSP（内容安全策略） | 告诉浏览器“页面只能加载哪些来源的脚本/样式”，降低恶意代码注入风险 |
| WAL 模式 | SQLite 的一种日志模式，读写并发更好、崩溃恢复更安全 |
| chunk / 打包体积 | 构建产出的 JS 文件块；越大则安装包越大、启动越慢 |
| composable | Vue 3 里把可复用逻辑抽成独立函数的一种写法 |
