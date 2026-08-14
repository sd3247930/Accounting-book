---
name: repackage-app
description: 清理旧打包产物，重新构建并生成 Windows（.exe）与 macOS（.dmg/.app）安装包，支持交互式更新版本号。当用户说“重新打包”“重新构建安装包”“生成新安装包”“打包应用”或要求生成新安装包时使用。
---

# 重新打包应用

## 角色定位

打包构建助手：帮助用户重新生成完整、可发布的 Windows 和 macOS 安装包，确保打包过程清洁、可靠，并提供版本管理辅助。

## 工作流程（每一步均需用户确认）

### 步骤 0：前置检查

- 确认当前项目为 Electron 项目（存在 package.json 且包含 electron-builder 或 electron 依赖）。
- 检查依赖：node_modules 缺失时提示先运行 npm install（或调用 run-project 技能）。
- 检查打包配置：electron-builder.yml 或 package.json 中的 build 字段，缺失时给出配置建议。

### 步骤 1：版本号管理（可选）

- 询问用户：“是否需要更新版本号？（当前版本为 <从 package.json 读取>）”
- 选择“是”：引导输入新版本号（x.y.z 语义化版本），更新 package.json 的 version 字段。
- 选择“否”：沿用当前版本。

### 步骤 2：清理旧打包产物

- 删除 dist/、release/、out/、packages/ 等打包产物目录（如存在），保证构建环境干净。
- 清理前告知用户；数据库等用户数据不在清理范围。

### 步骤 3：执行打包命令

- electron-builder：执行 npm run build && electron-builder --win / --mac（或项目定义的 dist 脚本）。
- 实时输出日志；出错时停止并提示具体原因（缺图标、权限不足、杀毒软件锁定等）。

### 步骤 4：产物验证

- 检查输出目录是否生成预期文件（如 KunPengBook-{version}-x64.exe、KunPengBook-{version}.dmg）。
- 显示产物路径和文件大小，询问是否打开产物目录。

### 步骤 5：后续指引

- 提示：“✅ 重新打包完成！产物位于 <目录>。可使用‘上传到GitHub’技能发布新版本，或直接分发安装文件。”

## 注意事项

- 依赖检查：electron-builder 未安装时提示 npm install -D electron-builder。
- 平台限制：非对应平台打包时提示需要交叉编译或使用 CI。
- 权限问题：权限被拒绝时建议以管理员权限运行终端（仅必要时）。
- 版本号规范：遵循语义化版本 x.y.z，避免发布混淆。
- 杀毒软件可能锁定打包输出目录，必要时将输出目录加入排除项。

## 异常处理

- 打包失败：输出错误摘要，建议查看完整日志。
- 清理目录失败（文件被占用）：提示关闭相关程序（如正在运行的应用实例）后重试。
