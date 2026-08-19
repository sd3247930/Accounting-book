# 安全审计判据、清单与报告模板

本文件是 security-audit 技能的详细参考：给出四项检查的可操作判据、Electron 专项说明、修复建议与报告模板。

## 目录

1. 严重级别定义
2. 检查一：敏感信息泄露
3. 检查二：漏洞风险（SQL 注入 / 命令注入 / XSS / 路径穿越）
4. 检查三：配置文件明文
5. 检查四：其它安全隐患
6. Electron 安全专项
7. 误报排除规则
8. 报告模板

## 1. 严重级别定义

| 级别 | 定义 | 处理 |
| --- | --- | --- |
| 🔴 严重 | 真实泄露或可被利用的漏洞（如硬编码生产密码、SQL 拼接、shell:true + 用户输入） | 必须修复，优先处理 |
| 🟡 建议 | 潜在风险或加固项（如 XSS 写入点、动态路径、弱加密、CSP 缺失） | 建议修复 |
| 🟢 亮点 | 做得好的安全实践（参数化查询、权限隔离、输入校验等） | 保持 |

## 2. 检查一：敏感信息泄露

用 `scripts/scan_secrets.py` 做首轮匹配，然后人工复核以下位置：

- 源码中的密码/口令：`password`、`passwd`、`pwd` 等赋值。
- API Key / Token：`api_key`、`apikey`、`token`、`secret`、`access_key`、`client_secret`。
- 私钥块：`-----BEGIN ... PRIVATE KEY-----`。
- 数据库/消息队列连接串：`mysql://user:pass@host`、`postgres://`、`mongodb://`、`redis://`、`jdbc:`。
- 云厂商密钥：AWS `AKIA...`、GitHub `ghp_...`、Slack `xox...` 等。
- JWT：`eyJ...` 三段式 Token。

判定原则：

- 值来自环境变量（`process.env.X`、`os.environ`、`import.meta.env`）→ 不算泄露，反而值得表扬。
- 值为占位符（`your_xxx`、`example`、`changeme`、`***`、空值）→ 不算泄露。
- 示例/演示数据（`demo`、`test123`）→ 不算生产泄露，可在报告中提示“示例凭据建议删除”。
- 真实且非占位 → 🔴 严重，建议改用环境变量或系统钥匙串，并提示轮换（rotate）已泄露的凭据。

## 3. 检查二：漏洞风险

### SQL 注入

危险写法（🔴）：

```js
// 字符串拼接 SQL：用户输入可直接改变 SQL 语义
db.prepare(`SELECT * FROM records WHERE note LIKE '%${keyword}%'`).all()
```

安全写法：

```js
// 参数绑定：输入只作为参数传递，不参与 SQL 语法解析
db.prepare('SELECT * FROM records WHERE note LIKE ?').all('%' + keyword + '%')
```

检查要点：

- 所有 SQL 必须经过 `prepare()` + 绑定参数，禁止拼接（`+`、模板字符串 `${}`、f-string `{}`）。
- `LIKE` 通配符按数据过滤处理，不由用户注入 SQL 片段。
- Python 侧（如用 sqlite3）必须用 `?` 占位符，禁止 f-string 拼 SQL。

### 命令注入

危险写法（🔴）：

```js
const { exec } = require('child_process')
exec('ping ' + userInput)          // 拼接
exec(`echo ${userInput}`, { shell: true })  // shell 解析
```

安全写法：

- 优先用 `execFile`/`spawn` 且不开启 `shell`，参数以数组传递。
- 必须执行 shell 时，对输入做严格白名单校验。

### XSS

- `innerHTML` / `outerHTML` / `insertAdjacentHTML` / `document.write` / Vue `v-html` 写入用户可控内容 → 🟡/🔴。
- 安全做法：用文本节点（`textContent`）、Vue 默认插值 `{{ }}`，或对 HTML 做白名单清洗。

### 路径穿越

- `fs.readFile/writeFile/unlink/rename` 等使用拼接路径，且路径来自用户输入 → 🔴/🟡。
- 安全做法：基于固定根目录解析，并校验解析结果仍在白名单目录内（`path.resolve` 后比对前缀）。

## 4. 检查三：配置文件明文

重点文件：`.env`、`.env.*`、`*.config.js/json/toml/yaml`、`package.json`、`electron-builder.*`、`docker-compose.*`。

判定原则：

- 配置文件中存在明文真实凭据 → 🔴（即使 `.gitignore` 排除了该文件，也应迁移到环境变量/钥匙串）。
- 配置文件只保留键名、值来自环境变量 → 🟢。
- 特别注意：打包进安装包的文件（electron-builder `files` 列表）若含密钥 → 🔴，会随分发泄露。

## 5. 检查四：其它安全隐患

- 弱加密：MD5/SHA1 用于密码或签名 → 🟡/🔴；密码存储应使用 bcrypt/argon2 等专用算法。
- 随机数：`Math.random()` 用于密钥/Token/会话 → 🔴（不可预测性不足），应使用 `crypto.randomBytes`。
- 输入校验：金额、日期、ID、备注等外部输入未校验类型/范围/长度 → 🟡；金额建议按“分”存储或校验正数与精度。
- 日志泄露：日志打印完整凭据或敏感数据 → 🟡，应打码。
- 依赖漏洞：运行 `npm audit --omit=dev` 检查已知漏洞（需要网络），高危依赖升级或替换。
- 越权/IDOR：按 ID 直接读取/删除数据而无归属校验 → 🟡（桌面单机应用风险低，联机服务则 🔴）。

## 6. Electron 安全专项

本项目是 Electron 应用，必须检查主进程配置：

- `contextIsolation: false` → 🔴，应保持默认开启，隔离预加载脚本与渲染页面的上下文。
- `nodeIntegration: true` → 🔴，渲染进程不应获得 Node 能力。
- `webSecurity: false` → 🔴，不应关闭同源策略。
- preload 暴露面：`contextBridge.exposeInMainWorld` 只暴露必要的最小 API，不要整包透传 `ipcRenderer` 或 `fs`。
- IPC 校验：主进程 `ipcMain.on` 处理事件时，校验 `event.senderFrame.url` / `event.sender` 来自可信窗口，避免其他页面冒名调用。
- CSP：`index.html` 配置 Content-Security-Policy，限制脚本来源（`script-src 'self'`）。
- 外部链接：`shell.openExternal` 只允许 `https:` 白名单，防止 `file://` 等协议滥用。

## 7. 误报排除规则

以下情况不算漏洞，报告需说明“已复核排除”：

- 值来自环境变量读取。
- 占位符/示例值（`your_*`、`example`、`changeme`、`***`、空串）。
- 测试代码中的固定测试凭据（标注为测试用途）。
- 注释或文档中举例的“危险写法”（仅示意，不在运行路径）。
- 正则匹配到变量名而非变量值（如 `const token = getToken()` 中 `token` 是变量名）。

## 8. 报告模板

```markdown
# 安全审计报告

> 检查范围：... | 文件数：... | 整体风险评级：高/中/低

## 🔴 严重问题

| 文件 | 行号 | 问题 | 影响 | 修复建议 |
| --- | --- | --- | --- | --- |

## 🟡 建议优化

| 文件 | 行号 | 问题 | 修复建议 |
| --- | --- | --- | --- |

## 🟢 优点亮点

- ...

## 扫描数据与误报说明

| 脚本 | 命中数 | 已排除误报 |
| --- | --- | --- |
| scan_secrets.py | ... | ... |
| scan_risks.py | ... | ... |

## 综合评价与优先修复清单

按严重程度排序的修复清单。
```
