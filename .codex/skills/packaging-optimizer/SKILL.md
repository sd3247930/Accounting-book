---
name: packaging-optimizer
description: 分析 electron-builder 打包配置，诊断安装包体积膨胀原因，实施依赖精简、asar 压缩、资源与语言包裁剪等优化，并重新生成新版本安装包。当用户说“优化打包”“减小体积”“打包新版本”“生成安装包”时使用。
---

# 打包体积优化

## 工作流程

1. 分析现状：阅读 package.json 的 build 配置与依赖，统计各打包产物（Portable/zip/NSIS）体积。
2. 诊断体积膨胀原因，常见检查项：
   - files 白名单是否把 dist 递归打包进自身、是否误包含多余目录
   - 是否启用 asar 与 compression: maximum
   - electronLanguages 是否只保留 zh-CN/en-US
   - node_modules 是否包含无用依赖（npm dedupe、检查 devDependencies）
   - 是否误打包 .git、测试文件、*.map
3. 实施优化（逐步、可验证）：
   - 修正 files 白名单，输出目录指向独立目录（如 packages/）
   - 启用 asar、压缩、精简语言包
   - 删除多余依赖与源码地图
4. 执行打包并验证：体积应低于目标（本项目参考：Portable ≤ 80MB），且应用可正常启动、功能完整。
5. 输出《体积优化分析报告》，说明原因与措施。

## 注意事项

- 打包前先提交代码，避免丢失工作区改动。
- 杀毒软件可能锁定输出目录；必要时把输出目录加入排除项。
- 优化不得削弱任何功能（分类管理、2048 等），打包后需冒烟验证。
