---
name: generate-docs
description: 扫描当前代码结构（src/electron/package.json/views），同步更新产品设计文档（README、docs/、claude.md）中的功能特性、技术栈、版本号、目录结构等章节，保持文档与代码一致。当用户说“生成文档”“更新产品文档”“更新README”时使用。
---

# 文档自动生成

## 工作流程

1. 扫描代码：列出 src/views、src/game2048、electron 等核心目录与 package.json 版本/依赖。
2. 核对现有文档（README.md、docs/*.md、claude.md），找出与实际代码不一致的章节。
3. 更新内容：
   - 功能特性：按实际视图/导航清单核对
   - 技术栈：与 package.json 依赖一致
   - 版本号与版本历史：与 git tag 一致
   - 界面预览：引用 prototype/preview 最新截图
4. 更新后检查 Markdown 渲染（链接、表格、图片路径）。
5. 提交更新（docs: ...），向用户说明改动了哪些章节。

## 注意事项

- 不臆造文档内容：功能描述必须与代码实际行为一致。
- 文档中不得包含 API Key、密钥等敏感信息。
