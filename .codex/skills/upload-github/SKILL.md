---
name: upload-github
description: 将当前项目完整上传至 GitHub：检查/初始化 Git、配置 SSH 或 HTTPS 远程仓库、推送分支与标签、必要时更新 README 与默认分支。当用户说“上传到GitHub”“推送到远程”“同步到GitHub”“发布到GitHub”时使用。
---

# 一键发布 GitHub

## 工作流程

1. 确认目标仓库地址（支持 SSH 或 HTTPS）；未提供时先询问。
2. 检查环境：git 是否初始化、SSH 密钥是否配置（ssh -T git@github.com）。
3. 添加/核对远程地址：git remote add origin <地址> 或 git remote set-url。
4. 提交本地所有改动（敏感文件除外），按项目约定推送 main 与 develop 分支及全部标签。
5. 若远程已有不相关历史（如手动上传的文件），先向用户说明并征得同意后再决定合并或覆盖。
6. 推送后验证 git ls-remote，用中文汇报远程分支与标签状态。

## 注意事项

- 覆盖远程内容（force push）前必须征得用户同意。
- 敏感文件（API Key、.env、提示词）不得上传；检查 .gitignore 与未跟踪文件。
- 全程中文沟通，每一步说明意图。
