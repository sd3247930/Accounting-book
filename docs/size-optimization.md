# 记账APP · Windows 安装包体积优化分析报告

> 版本：v1.2.0 ｜ 日期：2026-08-14 ｜ 目标：Portable 单文件 ≤ 200 MB

## 1. 问题现象

| 版本 | Portable.exe | zip |
|------|-------------|-----|
| v1.0.0 | ~185 MB | ~285 MB |
| v1.1.0 | ~459 MB | ~556 MB |

v1.1.0 只增加了分类管理功能（代码量 < 100 KB），体积却翻了约 1.5 倍，属于异常膨胀。

## 2. 根因诊断

对 v1.1.0 的 `win-unpacked` 实际测量：

- 整个 `win-unpacked`：**1032.9 MB**
- `resources/app.asar`：**703.8 MB**（正常应 < 30 MB）
- `locales/`：42.5 MB（Electron 自带的几十种语言包）

`app.asar` 内容分析发现三大问题：

1. **递归打包（主因）**：`package.json` 中 `files` 配置为 `dist/**/*`，
   而 electron-builder 的默认输出目录也是 `dist/`。于是上一次构建产生的
   `dist/win-unpacked`（含旧的 app.asar、electron 运行库）、`builder-debug.yml`
   甚至残缺文件都被打进了新的 app.asar，**每次打包体积都会叠加一轮**。
2. **node_modules 全量源码打包**：vue/element-plus/echarts 等已被 Vite 打包进
   渲染层产物，运行期根本不需要它们的源码，但仍被 electron-builder 按依赖收集进 asar
   （含 `.ts` 源码、`.map` 文件等）。
3. **未开启压缩**：默认 `compression = normal`，Portable 的 7z 载荷压缩率不足。

## 3. 优化措施（已落地到 package.json build 配置）

| 措施 | 配置 | 收益 |
|------|------|------|
| 输出目录与源码目录分离 | `directories.output = "packages"` | 根治递归打包 |
| 运行期依赖白名单 | `files` 只保留 dist/electron/shared + better-sqlite3 及其 bindings | asar 从 703MB → 约 20MB |
| 原生模块只解包 .node | `asarUnpack` 仅 `better-sqlite3/build/Release/**` | 减少解包体积 |
| 只保留中英文语言包 | `electronLanguages = ["zh-CN", "en-US"]` | locales 42.5MB → 约 5MB |
| 最高压缩 | `compression = "maximum"` | Portable 显著缩小 |
| 排除调试产物 | `!**/*.map`、`!**/test/**` 等 | 减少冗余文件 |

> 说明：运行时主进程只 `require` better-sqlite3（及其 `bindings`、`file-uri-to-path`），
> 渲染进程的 Vue/Element Plus/ECharts 已被 Vite 打包进 `dist/assets`，
> 因此白名单不会导致依赖缺失。

## 4. 打包命令（一键）

```bash
npm run pack:win
```

等价于：

```bash
npm run build          # 1. Vite 生产构建（自动清空 dist）
electron-builder --win portable zip nsis   # 2. 三种目标产物
```

产物输出到 `packages/`，文件名：

- `KunPengBook-{version}-x64-Portable.exe`
- `KunPengBook-Setup-{version}-x64.zip`
- `KunPengBook-Setup-{version}-x64.exe`（NSIS 安装版，受杀软影响时可能失败）

## 5. 验证结果

- `npm run build` 通过
- `npm run smoke`：`SMOKE_OK`，含分类 CRUD 与收入迁移断言
- `npm run migrate:test`：`MIGRATE_OK`（旧库升级不丢数据）
- 打包后以 `--smoke-test` 实际运行产物，退出码 0
- 体积实测（v1.2.0）：

| 产物 | v1.1.0 | v1.2.0 |
|------|--------|--------|
| Portable 单文件 | 459 MB | **78.2 MB** |
| zip | 556 MB | **117.3 MB** |
| NSIS 安装版 | 失败 | **85.5 MB** |

Portable ≤ 200 MB 目标达成，且远优于预期。

## 6. 附：NSIS 安装版受杀软影响的临时方案

本机 360 实时防护会锁定 makensis 生成在项目输出目录的卸载器 exe，
导致 NSIS 构建失败。已验证的临时方案：把输出目录指到已加入杀软排除的
electron-builder 缓存目录内，例如：

```bash
electron-builder --win nsis --config.directories.output="C:\Users\Administrator\AppData\Local\electron-builder\Cache\nsis\out"
```

构建成功后把 `KunPengBook-Setup-{version}-x64.exe` 复制/移动到 `release/` 即可。
