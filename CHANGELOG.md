# Changelog

## 1.3.1 — 2026-11-06

### Changed

- 使用情况的占比图只标出前 10 个 skill，其余并入「其他」。安装与卸载按钮移到对应 hook 卡片上。
- 最近读取时间改为 `YYYY-MM-DD HH:mm:ss`。skill 名称可进入详情，路径列固定为 240px。
- Skill 源展示使用次数和排名，并可按次数、排名、名称排序。
- 安装管理和 Skill 源可在卡片与列表之间切换。列表不显示路径。

## 1.3.0 — 2026-11-06

### Added

- 本机记录 Cursor 与 Codex 读取 skill 文件的次数，只写入 `~/.config/skillctl/usage.json`，不上传。
- `skill-ctl hook install` 同时安装两边的读取 hook，并把 `skillctl-usage` 放到 `~/.agents/skills`。
- 管理页新增「使用情况」，展示趋势、占比和每个 skill 的次数。详情页展示当前 skill 的次数和最近读取时间。
- 同一次会话里的每次文件读取都计入。只统计 `skills/` 或 `skills-cursor/` 下带扩展名的具体文件；纯目录、未展开的变量、花括号和通配符不计。
- 从详情返回安装管理或 Skill 源时，恢复搜索、筛选、选中项和滚动位置。

### Fixed

- 外部 Skill 准备（`npx skills add`）现在通过 `GIT_CONFIG_*` 把环境代理显式下传给子进程。此前若 git 全局配置里存在空的 `http.https://github.com/.proxy=`，它会覆盖 `HTTPS_PROXY`，导致克隆 GitHub 仓库时直连超时或连接被重置，外部 Skill 无法安装到任何 target（含 workbuddy）。

## 1.2.10 — 2026-11-05

### Removed

- 安装、固定 Agent 和其它管理变更不再在 Workspace 根生成 `.skillctl/workspace.json`。目录里已有该文件时，再次添加 Workspace 仍会按文件恢复 pin 并补装缺失 Skill。

## 1.2.9 — 2026-11-03

### Changed

- 安装管理 / Skill 源列表精简：工具栏按筛选与批量操作拆分，卡片字段收敛，启停与删除统一走工具栏。
- 搜索与筛选展示匹配数量；全选按钮显示已选数量；无选中时隐藏批量操作。
- 点击标题切换选中，点击简介进入详情；Skill 源路径配置改为路径旁图标。
- Skill 源类型标签嵌入简介开头；`external` 等标签改用配套蓝色。

## 1.2.8 — 2026-10-30

### Fixed

- 删除 Agent 时：若目录仅含 skills 则删除整个 Agent 目录；若还有其他文件/目录则只删 skills，避免误删 MCP 配置等。

## 1.2.7 — 2026-10-24

### Fixed

- Windows 外部 Skill 准备改为 `npx.cmd` + `shell: true`（Node 18.20+/22 禁止无 shell 直接 spawn `.cmd`，仅改文件名仍会 EINVAL）。

## 1.2.6 — 2026-10-24

### Fixed

- Windows 外部 Skill 准备改用 `npx.cmd`（1.2.7 起改为同时启用 `shell: true`）。
- Windows 仅支持 `copy` 安装；软链选项在 CLI 与管理页不可用，配置中的 symlink 也会按 copy 落地。
- 非 Windows 目录软链显式使用 `type: 'dir'`，并识别 junction，避免删除误伤源目录。

## 1.2.5 — 2026-10-24

### Changed

- 管理页「Skill 目录」更名为「Skill 源」；路径配置入口移至该页页头。
- 删除 Agent 时移除完整 Agent 目录（如 `.cursor`），不再只删 skills 子目录。

## 1.2.4 — 2026-10-24

### Added

- 管理页顶栏展示当前包版本（从 `package.json` 读取）。
- 支持 git/SSH Skill 源、`.skillctl/workspace.json` 项目配置，以及接入时自动补装缺失 Skill。

## 1.2.2 — 2026-09-23

### Added

- 管理页、目录页与详情页接入 fanta-monitor 匿名使用统计（页面访问、前端错误、性能），不上报 Skill 内容、路径或令牌；`SKILLCTL_NO_TELEMETRY=1` 可关闭，关闭时页面 CSP 不含任何第三方源。

## 1.2.0 — 2026-08-24

管理页补齐初始化、本机 Agent 扫描与安装过程可见性；CLI 欢迎页展示版本。

### Added

- 首次打开管理页时弹出初始化配置，导航栏保留配置入口。
- 扫描到本机已有 Agent 目录即展示，即使其中还没有 Skill。
- 列表展示软链损坏的 Skill，并支持只删除该损坏链接。
- 管理页安装时流式输出命令行日志；CLI 安装同样打印外部准备过程。
- 欢迎 banner 显示当前版本；支持 `skill-ctl -v`。

### Fixed

- 管理页内联脚本中的换行转义错误，避免页面停在「扫描中 / 读取中」。
- 外部包准备失败时去掉 ANSI/spinner，提炼可读错误。
- 开发会话用 pid 锁标记软链归属：残留的全局 `skill-ctl` 软链会在下次 `pnpm dev` 被接管并在退出时删除，不再永久残留。

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
