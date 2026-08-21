# skillctl

[English](README.md) | [简体中文](README.zh-CN.md)

配置驱动的 Agent Skill 安装器。`skillctl` 不内置 skill 源，需要先指定源目录，登记 skill，再安装到一个或多个 target。

## 环境

- Node.js 18.17 或更高
- 本地开发建议使用 pnpm

## 安装

```bash
git clone https://github.com/lion1ou/skillctl.git
cd skillctl
pnpm install
pnpm build
npm link
```

## 初始化

路径必须是绝对路径。交互式 init 先问源目录，再问缓存目录。本机配置已存在时，可选择保留或覆盖。

```bash
skillctl init --source /absolute/path/to/catalog --cache /absolute/path/to/cache
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
skillctl init --source /absolute/path/to/catalog
skillctl add --local
skillctl add <query|owner/repo>
skillctl install
skillctl install -G common -t cursor
skillctl install -s web-access -t cursor,codex --mode copy
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

每个 target 的 skills 目录写入 `.skillctl.json`。CLI 不安装 Rule 和 MCP。

## 开发

```bash
pnpm test
pnpm lint
```

发布到 npm 的包只包含 `bin/` 和编译后的 `dist/`，不会打包 catalog 源文件。
