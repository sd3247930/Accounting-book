---
name: security-audit
description: 对项目代码进行安全审计并生成中文报告：1) 检查代码中是否泄露密码/密钥/Token/私钥/数据库连接串等敏感信息；2) 检查 SQL 注入、命令注入、XSS、路径穿越等漏洞风险；3) 检查配置文件是否存在明文敏感信息；4) 检查其它安全隐患（Electron IPC 暴露、弱加密、缺失输入校验、CSP 等）。当用户说“安全检查”“安全审计”“安全扫描”“security audit”“检查密码泄露”“SQL注入检查”或要求排查代码安全隐患时使用。
---

# 安全审计

## 概览

对项目代码执行四项安全检查并输出中文报告：

1. **敏感信息泄露**：密码、API Key、Token、私钥、数据库连接串等硬编码/明文泄露。
2. **漏洞风险**：SQL 注入、命令注入、XSS、路径穿越等可利用漏洞。
3. **配置文件明文**：`.env`、`*.config.*`、`package.json` 等配置文件中的明文敏感信息。
4. **其它隐患**：Electron 安全配置、弱加密、输入校验缺失、权限过大等。

机械扫描交给 `scripts/` 下的两个脚本，人工复核与深度检查由 Codex 完成。

## 工作流程

1. **确定范围**：使用用户指定的文件/目录；未指定时默认扫描 `src/`、`electron/`、`shared/` 及项目根目录配置文件（`*.config.*`、`.env*`、`package.json`、`vite.config.js`、`electron-builder` 配置），排除 `node_modules/`、`dist/`、`release/`、`packages/`、`.git/`。
2. **机械扫描**（只读，不改代码）：
   - `python scripts/scan_secrets.py <路径...>`：扫描敏感信息；加 `--config-only` 只查配置文件明文。
   - `python scripts/scan_risks.py <路径...>`：扫描 SQL 注入、命令注入、XSS、路径穿越等风险模式。
3. **人工复核脚本结果**：区分真实问题与误报（占位符、测试数据、环境变量引用不算泄露）。
4. **人工深度检查**：按 `references/standards.md` 的完整清单逐项审查（Electron 专项、弱加密、输入校验、CSP、依赖漏洞等）。
5. **输出报告**：在项目根目录生成 `security-report.md`（中文、表格），按 🔴 严重 / 🟡 建议 / 🟢 亮点 分级，每个问题带文件、行号、影响与修复建议。
6. **处理原则**：审计只读，不直接修改代码；发现真实漏洞时向用户报告并给出修复方案，由用户决定是否修复。

## 检查清单（脚本之外必做的人工项）

- 硬编码凭据：密码、API Key、Token、私钥、数据库连接串（含配置与示例文件）。
- SQL 全部参数化：better-sqlite3 使用 `prepare()` + 绑定参数，禁止字符串拼接。
- 命令执行：`exec/spawn` 使用 `shell: true` 或拼接用户输入。
- XSS：`v-html` / `innerHTML` 渲染未经过滤的用户数据。
- 路径穿越：`fs` 操作用户可控路径未做白名单校验。
- Electron 安全：`contextIsolation`、`nodeIntegration`、preload 暴露面、`webSecurity`、CSP、IPC 事件校验 `sender`。
- 弱加密：MD5/SHA1 存密码、`Math.random` 用于安全用途、硬编码 IV/盐。
- 输入校验：金额、日期、ID 等外部输入是否校验类型与范围。
- 依赖漏洞：`npm audit --omit=dev`（可选，需网络）。

详细判据、Electron 专项说明、修复建议与报告模板见 `references/standards.md`。

## 报告格式

`security-report.md`（中文、表格、非技术用户可读）：

| 章节 | 内容 |
| --- | --- |
| 概览 | 检查范围、文件数、整体风险评级（高/中/低） |
| 🔴 严重问题 | 可被利用或真实泄露：文件 + 行号 + 问题 + 影响 + 修复建议 |
| 🟡 建议优化 | 潜在风险与加固建议 |
| 🟢 优点亮点 | 做得好的安全实践 |
| 扫描数据 | 两个脚本的命中清单，附误报排除说明 |

## 资源

- `scripts/scan_secrets.py`：敏感信息静态扫描（支持 `--config-only` 检查配置文件）。
- `scripts/scan_risks.py`：SQL 注入 / 命令注入 / XSS / 路径穿越等风险模式扫描。
- `references/standards.md`：完整检查清单、Electron 专项、修复建议与报告模板。
