# skillctl

[English](README.md) | [简体中文](README.zh-CN.md)

Configuration-driven installer for Agent Skills. `skillctl` does not ship a catalog. You point it at a source directory, register skills, then install them into one or more agent targets.

## Requirements

- Node.js 18.17 or later
- pnpm (recommended for local development)

## Install

```bash
git clone https://github.com/lion1ou/skillctl.git
cd skillctl
pnpm install
pnpm build
npm link
```

## Initialize

Paths must be absolute. Interactive init asks for the source directory first, then the cache directory. If a local config already exists, you can keep it or overwrite it.

```bash
skillctl init --source /absolute/path/to/catalog --cache /absolute/path/to/cache
```

- `--source` is required in non-interactive mode.
- `--cache` is optional. The default is `<skillctl>/.cache`.
- Machine-local mapping is stored at `~/.config/skillctl/config.json`.

If the source directory has no catalog files, init creates:

- `skillctl-skills.json` — skill registry
- `skillctl-categories.json` — category table

The generated files include two example remote skills. Existing files are not overwritten.

## Commands

```bash
skillctl init --source /absolute/path/to/catalog
skillctl add --local
skillctl add <query|owner/repo>
skillctl install
skillctl install -G common -t cursor
skillctl install -s web-access -t cursor,codex --mode copy
```

### add

`add` only updates the catalog. It does not install skills or write the cache.

- `add --local` registers unlisted skills under `sourceDir/skills/`.
- `add <keyword>` searches [skills.sh](https://skills.sh).
- `add <owner/repo>` lists sub-skills in that package.

### install

`install` always runs: select → check → prepare → distribute.

1. Choose scope (current directory or `~`), mode (symlink or copy), targets, and skills.
2. Interactive skill selection is grouped by category. Child skills are indented. Selecting a category selects every skill in it.
3. Skills missing from the registry are removed from the category table with a notice, not an error.
4. Missing external skills are cached with a progress spinner, then copied or symlinked into each target.

## Catalog layout

```text
<sourceDir>/
├── skillctl-skills.json
├── skillctl-categories.json
└── skills/<skill-name>/
```

Each registry item has `id`, `package`, `name`, a Chinese `description`, `version`, `source`, and `type` (`local` or `external`). A skill belongs to exactly one category.

## Cache

External skills are staged under:

```text
<cacheDir>/<owner>/<repo>/<skillName>/
```

`npx skills add` staging leftovers (`.agents/`, `skills-lock.json`) are removed after the skill is moved into that path.

## Targets

| target | skills directory |
| --- | --- |
| cursor | `.cursor/skills` |
| claude | `.claude/skills` |
| kiro | `.kiro/skills` |
| agents | `.agents/skills` |
| codex | `.codex/skills` |
| openclaw | `.openclaw/skills` |
| hermes | `.hermes/skills` |

Each target skills directory records installs in `.skillctl.json`. `skillctl` does not install rules or MCP configs.

## Development

```bash
pnpm test
pnpm lint
```

The published npm package contains only `bin/` and compiled `dist/`. Catalog sources are never bundled.
