# skill-ctl

[English](README.md) | [简体中文](README.zh-CN.md)

Configuration-driven installer for Agent Skills. `skill-ctl` does not ship a catalog. You point it at a source directory, register skills, then install them into one or more agent targets.

## Requirements

- Node.js 18.17 or later
- pnpm (recommended for local development)

## Install

```bash
npm install -g @lion1ou/skill-ctl
```

Global install provides the `skill-ctl` command. You can also run it without installing:

```bash
npx @lion1ou/skill-ctl
```

For local development:

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
skill-ctl init --source /absolute/path/to/catalog --cache /absolute/path/to/cache
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
skill-ctl init --source /absolute/path/to/catalog
skill-ctl add --local
skill-ctl add <query|owner/repo>
skill-ctl install
skill-ctl install -G common -t cursor
skill-ctl install -s web-access -t cursor,codex --mode copy
skill-ctl manage
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
5. Skills with `"enabled": false` in the registry are skipped during install and listed in the result. Missing `enabled` is treated as enabled.

### manage

`manage` starts a local dashboard on `127.0.0.1` with two pages:

```bash
skill-ctl manage
skill-ctl manage --port 4173 --no-open
```

- `/` Installed skills: scans the user home directory by default, and can add project Workspaces through the native directory picker or an absolute path. Each Workspace is scanned using the Agent-specific subdirectories; only Agents with skills or explicitly pinned by the user are shown.
- The top-right Install button opens a category dialog and installs into the current Agent under the current Workspace. Enable/disable renames `SKILL.md` ↔ `SKILL.md.disable`.
- `/catalog` Catalog: visually edit `skillctl-skills.json` and `skillctl-categories.json`. Change category, description, and install-time `enabled`, and sync unregistered local skills from the source directory. This switch only affects `install`, not files already installed.
- The installed page filters by name and status, places enabled skills before disabled ones, and refreshes filesystem state every three seconds.
- Workspace paths and pinned Agents are stored in `~/.config/skillctl/config.json`. Removing a Workspace only removes the management entry; it never deletes project files.
- Toggling a symlinked installed skill modifies its real source and affects other links to that source, so the page asks for confirmation.
- The service only binds to the loopback address and protects its API with a random per-process token.

## Catalog layout

```text
<sourceDir>/
├── skillctl-skills.json
├── skillctl-categories.json
└── skills/<skill-name>/
```

Each registry item has `id`, `package`, `name`, a Chinese `description`, `version`, `source`, `type` (`local` or `external`), and `enabled`. A skill belongs to exactly one category.

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

Each target skills directory records installs in `.skillctl.json`. `skill-ctl` does not install rules or MCP configs.

## Development

```bash
npm run dev
# equivalent: pnpm run dev
```

`npm run dev` temporarily points the global `skill-ctl` command at this repo's development entry:

- If `skill-ctl` is missing, it is registered in the npm global `bin`.
- If `skill-ctl` already exists, it is replaced with a symlink to the development repo and the original target is remembered.
- When the process exits (including Ctrl+C), a command that did not exist is removed; an existing command is restored to its previous target.

While the session is running, use `skill-ctl manage` from another terminal. Extra arguments are forwarded to the development CLI:

```bash
npm run dev -- manage --no-open
pnpm test
pnpm lint
```

The published npm package contains only `bin/` and compiled `dist/`. Catalog sources are never bundled.
