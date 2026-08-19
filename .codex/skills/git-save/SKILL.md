---
name: git-save
description: 纯粹的代码存档技能：展示改动、按中文规范写提交信息并执行 git add/commit。不做质量门禁校验（放行与否由 .githooks/pre-commit 钩子与 gitcommit-agent 决定）、不做回滚/删除等破坏性操作。当用户说“存档”“提交代码”“git-save”或要求执行 git commit 时使用。
---

# git-save（存档提交）

## 职责边界

- 只做存档：`git status` 展示 → `git add` → 规范提交信息 → `git commit`。
- **不做质量门禁校验**：通行证是否有效由 pre-commit 钩子（`.githooks/pre-commit`）和 gitcommit-agent 负责，本技能不检查、不代写通行证。
- **不做破坏性操作**：回滚、删除分支、强制推送等请改用 git-manager 技能，并在操作前向用户解释说明。

## 工作流程

1. 运行 `git status --short` 展示将要提交的改动，用一句话向用户说明提交范围。
2. 确定提交范围：用户指定文件则 `git add <文件...>`，未指定则 `git add -A`。
   - `.quality-gate/` 已被 `.gitignore` 排除，通行证不会进入版本库。
3. 提交信息规范（中文，前缀 + 一句话说明）：
   - `feat:` 新功能
   - `fix:` 修复
   - `refactor:` 重构
   - `docs:` 文档/注释
   - `chore:` 工具链/配置/杂项
   - `test:` 测试
   - 示例：`feat: 增加质量门禁 pre-commit 钩子`
4. 执行 `git commit -m "<信息>"`。
   - 若 pre-commit 钩子拒绝（exit 1），把拒绝原因原样告知用户，提示先运行 gitcommit-agent 完成测试与质量检查。
5. 提交成功后报告 commit 短哈希与提交信息；提示是否 push（push 时 pre-push 钩子会自动清除通行证；git 未实现 post-push 钩子，故用 pre-push 实现清除）。
