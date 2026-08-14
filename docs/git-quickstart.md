# 鲲鹏记账 · Git 基础操作快速参考

> 面向零基础项目拥有者。本项目的 Git 仓库已初始化，当前分支为 `master`。

## 1. 为什么用 Git

把项目每个阶段的代码“拍快照”存起来：

- 改坏了可以回退到任意历史版本
- 每次改动都有记录（谁、什么时候、改了什么）
- 本地文件丢失也能从仓库恢复

## 2. 日常三连：保存一次改动

```bash
git status                # 查看当前有哪些改动
git add .                 # 把改动放入“暂存区”（准备保存）
git commit -m "说明这次改了什么"   # 正式保存为一个版本
```

建议：每完成一个功能或修复就提交一次，说明写清楚（中文即可）。

## 3. 查看历史

```bash
git log --oneline         # 简洁版历史（版本号 + 说明）
git log --stat            # 详细版（每次改动涉及哪些文件）
```

## 4. 回退

> ⚠️ 回退有风险，重要操作前先提交或备份。

```bash
git log --oneline         # 先找到想回退到的版本号（前 7 位即可）
git reset --hard <版本号>  # 强制回到该版本（会丢弃之后的未提交改动）
git reset --hard HEAD~1   # 回到上一个版本
```

## 5. 分支（可选）

```bash
git branch develop                    # 创建开发分支
git checkout develop                  # 切换到开发分支
git checkout master                   # 切回主分支
git merge develop                     # 把开发分支合并回主分支
```

## 6. .gitignore 说明（自动忽略的文件）

| 条目 | 含义 |
|------|------|
| `node_modules/` | 第三方依赖包（可用 `npm install` 重新生成） |
| `build/`、`dist/` | 编译/打包产物（可重新生成） |
| `release/` | 安装包等交付产物（体积大、不入库） |
| `*.log`、`*.tmp` | 日志和临时文件 |
| `.env` | 环境变量（含 API Key，**绝不能入库**） |
| `.DS_Store`、`Thumbs.db` | 操作系统垃圾文件 |
| `.vscode/`、`.idea/` | 编辑器个人配置 |
| `*.db*` | 本地数据库文件（数据另有导出备份） |
| `*.exe`、`*.dmg` | 可执行文件/安装包 |

## 7. 安全红线

- `.env`、API Key、密码等**永远不要提交**进 Git
- 大文件（>50MB）不要入库；需要备份时用应用内的 CSV/JSON 导出
- 当前未配置远程仓库，如需备份到 GitHub/Gitee 再另行配置

## 8. 当前仓库状态（2026-08-14）

```text
e099190 chore: 打包配置优化与开发进度记录
d92615d feat: 鲲鹏记账 v1.0 初始版本（Electron + Vue 3 + SQLite）
```
