# 项目敏感内容审计报告

> 审计日期：2026-08-23
> 范围：整个项目（含 .codex 配置与技能、docs、课件、图片；排除 node_modules/.git/dist/release/packages）
> 方式：security-audit 脚本扫描 + rg 正则补充 + 图片视觉识别（阿里云百炼）+ git 已跟踪/远程分支复核
> 整体结论：**未发现真实密码/Token/密钥泄露**；存在**本地绝对路径泄露**与**不应公开的文件**（重点见 🔴）

## 一、六项检查结论总览

| 检查项 | 结论 |
| --- | --- |
| 1. 密码或 Token | ✅ 未发现真实凭据（含 .codex，0 命中） |
| 2. 个人隐私 | ✅ 文本无邮箱/手机/身份证/IP；图片抽样均为流程图/宣传素材，无个人数据；⚠️ docs 里暴露了 Windows 用户名路径 |
| 3. 本地绝对路径 | 🔴 多处已提交并公开（.codex 配置、两个提示词文件、docs、报告） |
| 4. 临时文件 | ✅ 无 *.tmp/*.log/*.bak 等残留 |
| 5. 测试垃圾文件 | 🟡 `my.txt`（hook 测试文件）已提交并推送到 develop；`prototype/preview/` 为开发期截图产物已入库 |
| 6. 不应公开的内容 | 🔴 两个个人提示词文件已公开；`课件/` 整套课程材料已公开（是否适合公开由你决定） |

## 二、🔴 严重问题

### 1. 个人提示词文件已推送到公开仓库（develop 分支）

| 文件 | 问题 | 位置 |
| --- | --- | --- |
| `提示词.txt` | 含本机绝对路径（`<本机路径>\codex-专业技能包\README.md`）与个人技能安装说明；已推送 origin/develop | 第 1 行 |
| `鲲鹏记账提示词.txt` | 同上，含本机绝对路径与个人技能链接 | 第 1、1118 行 |

影响：公开仓库任何人都能看到你的本机目录结构和个人工作流配置。

建议：
- `提示词.txt` 已从 main 删除（上轮 API 删除），但仍在 develop 分支与 git 历史中 → 从 develop 删除并推送；要彻底清除历史需 git 历史改写（如 filter-repo，影响所有克隆）。
- `鲲鹏记账提示词.txt` 同样建议删除（或确认你确实想公开）。

### 2. Windows 用户名绝对路径写入文档（已公开）

`docs/size-optimization.md` 第 90 行：

```
electron-builder --win nsis --config.directories.output="C:\Users\<用户名>\AppData\Local\electron-builder\Cache\nsis\out"
```

暴露了真实 Windows 用户名与本地路径。建议改为占位符：`C:\Users\<用户名>\AppData\Local\...`。

## 三、🟡 建议优化

### 1. `.codex` 配置与技能中的绝对路径（已公开）

| 文件 | 位置 | 内容 |
| --- | --- | --- |
| `.codex/agents/tester.toml`、`reviewer.toml`、`quality-engineer.toml`、`gitcommit-agent.toml` | skills.config | `path = "<项目根目录>/.codex/skills/..."` |
| `.codex/config.toml` | 第 9 行 | `command_windows = 'node "<项目根目录>/..."'` |
| `.codex/skills/claude-vision-skill/SKILL.md` | 全文示例 | `node "<项目根目录>\.codex\skills\..."` |
| `code-review-report.md` 等报告 | 全文链接 | `/D:/codex%20code/...` 形式的绝对路径链接 |

建议：统一改为相对路径或 `$PROJECT_ROOT` 占位符，保证可移植性且不泄露目录结构。

### 2. 测试垃圾文件（已公开）

- `my.txt`：hook 拦截测试文件，已提交（5aad434）并推送 → 建议 `git rm` 删除。
- `prototype/preview/*.png`（14 张）：runShotTest 开发期截图产物 → 建议删除或移出版本库（可由脚本随时再生成）。

### 3. 非代码资产是否公开（需你决策）

- `课件/`（8 个 Markdown 课程文件）：整套课程材料已在公开仓库中。
- `PIC/`（9 张应用宣传图）与根目录 `钩子开发.png`：无隐私，但属于营销素材，放代码仓库是否合适由你决定。

## 四、🟢 优点亮点（已确认安全）

- **无任何真实凭据入库**：全项目（含 .codex）密码/Token/私钥/连接串 0 命中。
- **`claude-vision-skill/.env`（含 DASHSCOPE API Key）已被 .gitignore 正确忽略**，git ls-files 复核确认未入库。
- 文本中无邮箱、手机号、身份证号；`package-lock.json` 里的邮箱是第三方依赖作者的公开联系邮箱，非个人隐私。
- 图片抽样识别（`钩子开发.png`、PIC/1/2/3/9）：均为流程图/应用宣传素材，无姓名、地址、账号等个人数据；`prototype/preview` 截图由代码生成、内容为样例数据。
- `%APPDATA%\鲲鹏记账\kunpeng.db`、`localhost:5173` 等为环境占位符/开发地址，属正常用法。

## 五、修复建议（按优先级）

1. **P0**：从 develop 删除 `提示词.txt`、`鲲鹏记账提示词.txt`、`my.txt` 并推送；如需彻底清除历史再讨论历史改写方案。
2. **P1**：`docs/size-optimization.md:90` 的用户名路径改为占位符。
3. **P1**：`.codex` 配置与技能里的绝对路径改为相对路径/占位符。
4. **P2**：删除 `prototype/preview/` 截图产物；评估 `课件/`、`PIC/` 是否留在公开仓库。

> 说明：本审计只读，未修改任何文件；以上修复需你确认后执行。
