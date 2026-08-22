# Changelog

## 1.1.0 — 2026-08-23

本机管理页升级。包名仍为 `@lion1ou/skill-ctl`，命令仍为 `skill-ctl`。

### Added

- 多 Workspace：默认扫描用户根目录，可添加项目目录；可固定要展示的 Agent。
- 更多 Agent target（Gemini、Copilot、Windsurf、Roo、OpenCode、OpenHands、Droid、Continue、Trae、Workbuddy、Qoder、CodeBuddy、Qwen 等）。
- 安装管理与 Skill 目录的顶栏切换、分类安装弹窗、已启用优先排序。
- 点击卡片查看 Skill 详情：只读 `SKILL.md`（禁用为 `SKILL.md.disable`），YAML 与 Markdown 分开展示。
- 品牌图标与 favicon。

### Safety

- 删除 Workspace：只移出管理列表，不删除项目文件；用户根目录不可删。
- 删除 Agent Skill：只删除当前 Workspace 中该 Agent 的 skills 目录（软链则只删链接）并取消固定。
- 目录删除：只移除配置表登记，不删源文件。
- 详情读取限制在已管理 Workspace、本地源目录或外部缓存根内；未缓存的外部 Skill 不自动下载。

### Docs

- 中英 README 同步管理页行为与删除语义。

## 1.0.0

首次发布：配置驱动安装、配置表、本机管理页与 npm 包 `@lion1ou/skill-ctl`。
