# skill-ctl

[English](README.md) | [简体中文](README.zh-CN.md)

配置驱动的 Agent Skill 安装器。`skill-ctl` 不内置 skill 源，需要先指定源目录，登记 skill，再安装到一个或多个 target。

## 环境

- Node.js 18.17 或更高
- 本地开发建议使用 pnpm

## 安装

默认从私有源安装（需先配置 scope）：

```bash
npm config set @lion1ou:registry https://npm.n.lion1ou.tech:16666/
npm install -g @lion1ou/skill-ctl
```

全局安装后可直接使用 `skill-ctl`。也可以不安装、临时执行：

```bash
npx @lion1ou/skill-ctl
```

Skill 源目录（如 `lion1ou-skills`）不随本包分发，请用绝对路径或 git 地址初始化：`skill-ctl init --source <path-or-git-url>`。统一说明见同级 [`../PRIVATE-NPM.md`](../PRIVATE-NPM.md)。

本地开发：

```bash
git clone https://github.com/lion1ou/skillctl.git
cd skillctl
pnpm install
pnpm build
npm link
```

## 初始化

Skill 源可为本地绝对路径，或 git 远程地址（`https://` / `git@` / `ssh://`）。填写远程地址时，会 clone 到 `~/.config/skillctl/sources/<owner>/<repo>`，并在配置中记录 `sourceRemote`。交互式 init 先问源，再问缓存目录。本机配置已存在时，可选择保留或覆盖。

```bash
skill-ctl init --source /absolute/path/to/catalog --cache /absolute/path/to/cache
skill-ctl init --source https://github.com/owner/skill-catalog.git
```

- 非交互环境必须提供 `--source`。
- `--cache` 可选，默认是 `<skillctl>/.cache`。
- 本机关联写在 `~/.config/skillctl/config.json`。

源目录里如果还没有配置表，会生成：

- `skillctl-skills.json` — 注册表
- `skillctl-categories.json` — 分类表

新建的表会带 2 个远程 skill 示例。已有文件不会覆盖。

## 命令

```bash
skill-ctl init --source /absolute/path/to/catalog
skill-ctl add --local
skill-ctl add <query|owner/repo>
skill-ctl install
skill-ctl install -G common -t cursor
skill-ctl install -s web-access -t cursor,codex --mode copy
skill-ctl manage
```

### add

`add` 只更新配置表，不安装，也不写缓存。

- `add --local` 登记 `sourceDir/skills/` 中尚未写入注册表的本地 skill。
- `add <关键词>` 查询 [skills.sh](https://skills.sh)。
- `add <owner/repo>` 列出该包内的子 skill。

### install

`install` 固定执行：选择 → 检查 → 准备 → 分发。

1. 选择范围（当前目录或 `~`）、模式（软链或复制）、target 和 skill。
2. 交互选择按分类分组，子 skill 缩进展示；选中分类即选中该分类下全部 skill。
3. 注册表里已删除的 skill 会从分类表中移除并提示，不报错。
4. 缺失的外部 skill 会带进度动画缓存，再软链或复制到各个 target。
5. 配置表中 `enabled` 为 `false` 的 skill 安装时直接跳过，并在安装结果中列出。缺省视为启用。

### manage

`manage` 在 `127.0.0.1` 启动本机管理页面，顶栏可在「安装管理」和「Skill 目录」之间切换。

```bash
skill-ctl manage
skill-ctl manage --port 4173 --no-open
```

**安装管理 `/`**

- 默认扫描用户根目录，也可通过系统目录选择器填入绝对路径后新增项目 Workspace。路径配置里的源（绝对路径或 git 地址）和缓存目录同样可选择本地目录后填入，不会在选择时直接保存。每个 Workspace 按 Agent 对应子目录扫描；只展示含 Skill 或用户主动固定的 Agent。新增/固定 Agent 时，若对应 skills 目录不存在会自动创建。
- 安装或变更后会在 Workspace 根写入可提交的 `.skillctl/workspace.json`（含 SSH 源地址、固定 Agent、已装 Skill）。再次添加该目录时会按文件恢复 pin，并自动补装缺失 Skill；若本机尚未 init 且当前目录有该文件，可用其中的 `sourceRemote` 完成源配置。
- 右上角「安装」打开分类安装弹窗，将所选分类安装到当前 Workspace 的当前 Agent。卡片上的启用/禁用会把 `SKILL.md` 与 `SKILL.md.disable` 互相改名。
- 点击 Skill 卡片进入详情，读取该 Workspace/Agent 下已落地的 `SKILL.md`（禁用为 `SKILL.md.disable`）。YAML frontmatter 与 Markdown 正文分开展示。点击启用/禁用不会进入详情。
- 删除 Workspace 只从管理列表移除，不删除项目文件；用户根目录不可删除。
- 删除某个 Agent 的 Skill 会删除当前 Workspace 中该 Agent 的 skills 目录并取消固定；目录本身为软链时只删除链接。
- 可按名称、启用状态、已失效、软链或复制筛选，每 3 秒同步一次文件系统变化；已启用 Skill 默认排在未启用项之前。可勾选当前筛选结果批量删除：软链只移除链接，副本删除目标目录，源目录保留；单项失败不会中断其余项。
- 损坏软链可选择新的源目录恢复。新目录必须存在，且包含 `SKILL.md` 或 `SKILL.md.disable`；已丢失的旧源不会被改动。
- Workspace 列表和固定展示的 Agent 保存在 `~/.config/skillctl/config.json`。

**Skill 目录 `/catalog`**

- 可视化编辑 `skillctl-skills.json` 与 `skillctl-categories.json`，可改分类、描述、安装启用开关，并把源目录中未登记的本地 skill 同步进配置表。这里的启用只影响 `install`，不会改已安装文件。
- 点击卡片进入详情，读取配置表登记 Skill 的源 `SKILL.md`。外部 Skill 尚未缓存时显示「尚未准备」，不会自动下载。
- 从目录删除只移除配置表登记，不删除源文件。

**共用约定**

- 详情页只展示 `SKILL.md`（或禁用文件），不列出 Skill 目录中的其他源文件。读取路径必须落在已管理 Workspace、本地源目录或外部缓存根内。
- 软链 skill 的文件启停会修改真实来源，并影响其他指向同一来源的链接，页面操作前会明确确认。
- 服务只监听回环地址，API 使用启动时生成的随机令牌校验请求。

## 源目录结构

```text
<sourceDir>/
├── skillctl-skills.json
├── skillctl-categories.json
└── skills/<skill-name>/
```

注册表每项包含 `id`、`package`、`name`、中文 `description`、`version`、`source`、`type`（`local` 或 `external`）和 `enabled`（启用 / 未启用）。每个 skill 只属于一个分类。

## 缓存

外部 skill 缓存在：

```text
<cacheDir>/<owner>/<repo>/<skillName>/
```

`npx skills add` 留下的 `.agents/` 和 `skills-lock.json` 会在整理后删除。

## Target

| target | skills 目录 |
| --- | --- |
| cursor | `.cursor/skills` |
| claude | `.claude/skills` |
| kiro | `.kiro/skills` |
| agents | `.agents/skills` |
| codex | `.codex/skills` |
| openclaw | `.openclaw/skills` |
| hermes | `.hermes/skills` |
| gemini | `.gemini/skills` |
| copilot | `.copilot/skills` |
| windsurf | `.codeium/windsurf/skills` |
| roo | `.roo/skills` |
| opencode | `.config/opencode/skills` |
| openhands | `.openhands/skills` |
| droid | `.factory/skills` |
| continue | `.continue/skills` |
| trae | `.trae/skills` |
| trae-cn | `.trae-cn/skills` |
| workbuddy | `.workbuddy/skills` |
| qoder | `.qoder/skills` |
| qoder-cn | `.qoder-cn/skills` |
| codebuddy | `.codebuddy/skills` |
| qwen | `.qwen/skills` |

每个 target 的 skills 目录写入 `.skillctl.json`。CLI 不安装 Rule 和 MCP。

## 开发

```bash
npm run dev
# 等价：pnpm run dev
```

`npm run dev` 会把全局 `skill-ctl` 临时指到本仓库的开发入口：

- 本机还没有 `skill-ctl`：注册到 npm 全局 `bin`。
- 本机已有 `skill-ctl`：改成软链到开发仓库，并记住原来的指向。
- 进程结束（包括 Ctrl+C）：原先没有则删除本次注册；原先有则去掉开发软链并恢复原指向。

开发期间可在其他终端直接运行 `skill-ctl manage`。带参数时仍会转给开发态 CLI：

```bash
npm run dev -- manage --no-open
pnpm test
pnpm lint
```

发布到 npm 的包只包含 `bin/` 和编译后的 `dist/`，不会打包 catalog 源文件。

版本说明见 [CHANGELOG.md](CHANGELOG.md)。提交后发布到私有源：

```bash
pnpm test
pnpm run publish:npm
```
