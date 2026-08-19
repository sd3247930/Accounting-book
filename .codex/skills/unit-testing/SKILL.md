---
name: unit-testing
description: 为项目核心代码创建单元测试并执行，生成测试报告。包括：扫描核心函数、编写测试用例（优先 Node 内置 test runner，数据库层走 Electron 环境）、运行测试、汇总通过率/失败详情/覆盖率并输出 Markdown 报告。当用户说“单元测试”“创建测试”“跑测试”“执行测试”“测试报告”“测试一下”时使用。
---

# 单元测试

## 工作流程

1. 扫描核心模块，区分两类：
   - **纯 JS/ESM 模块**（如 `src/game2048/*.mjs`、`src/utils/*.js`）：Node 直接可测。
   - **依赖原生模块的模块**（如 `electron/db.js`，better-sqlite3 为 Electron 编译）：必须通过 Electron 运行测试。
2. 创建测试文件，统一放 `test/` 目录：
   - 纯模块：`test/<模块名>.test.mjs`，用 `node:test` + `node:assert/strict`。
   - 数据库层：`test/db.test.js`，用 `npx electron test/db.test.js` 运行，数据库用临时文件并测试后清理。
   - 每个函数至少覆盖：正常输入、边界值（空、0、最大值）、异常输入（非法值、不存在 ID）。
   - 每个用例加中文注释说明意图。
3. 执行测试：
   - 纯模块：`node --test test/`。
   - 数据库层：`npx electron test/db.test.js`（需 app.whenReady 后运行，退出码 0=通过）。
   - 需要覆盖率时：`node --test --experimental-test-coverage test/`。
4. 生成报告：汇总用例总数、通过数、失败数、成功率；失败用例列出“函数/输入/期望值/实际值”；写入项目根目录 `test-report.md`（中文、表格形式，非技术用户可读）。
5. 处理失败：定位是代码 bug 还是测试断言错误，修复后重跑直到全部通过；向用户解释失败原因。

## 测试模板（纯 ESM 模块）

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as game from '../src/game2048/game.mjs'

// 用例：左移合并 [2,2,0,0] → [4,0,0,0]，得分 +4
test('左移合并两个2，得分加4', () => {
  const res = game.move(
    [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    game.DIR.LEFT
  )
  assert.deepEqual(res.grid, [[4, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
  assert.equal(res.gained, 4)
})
```

## 测试模板（数据库层，Electron 运行）

```js
// 运行方式：npx electron test/db.test.js
const { app } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const db = require('../electron/db')

app.whenReady().then(() => {
  const p = path.join(os.tmpdir(), 'kpb-unit-test.db')
  ;[p, p + '-wal', p + '-shm'].forEach((x) => fs.rmSync(x, { force: true }))
  db.open(p)
  // 在此写断言，失败时 console.error 并 app.exit(1)
  db.close()
  app.exit(0)
})
```

## 注意事项

- 只验证行为，不改动被测代码逻辑；测试发现 bug 时向用户报告后修复。
- 数据库测试一律使用临时数据库文件，禁止污染真实用户数据（%APPDATA%\鲲鹏记账\kunpeng.db）。
- 测试命令必须能从项目根目录运行，并在 README 或 package.json 提供 `npm test` 等价入口（如 `node --test test/`）。
- 报告全程中文，失败信息包含可操作的修复建议。
