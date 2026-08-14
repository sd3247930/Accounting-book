---
name: project-setup
description: 检测 Node.js 与 npm 环境，安装项目全部依赖（npm install），必要时重建原生模块（electron-rebuild）并确认开发环境可用。当用户说“初始化项目”“安装依赖”“配置环境”时使用。
---

# 项目环境初始化

## 工作流程

1. 检查环境：node -v 与 npm -v，缺失时给出安装指引。
2. 安装依赖：npm install（postinstall 会自动执行 electron-builder install-app-deps）。
3. 验证原生模块：better-sqlite3 需匹配 Electron 版本，若报 ABI 错误执行 npm run rebuild。
4. 构建验证：npm run build 确认无编译错误；可选 npm run smoke 验证数据库读写。
5. 用中文汇报环境状态与下一步建议（如 npm run dev）。

## 注意事项

- 安装依赖耗时较长，需耐心等待；网络异常时提示重试或使用国内镜像。
- 不修改 package.json 内容，除非用户明确要求。
