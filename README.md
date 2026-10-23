# skill-ctl

[English](README.md) | [简体中文](README.zh-CN.md)

Configuration-driven installer for Agent Skills. `skill-ctl` does not ship a catalog. You point it at a source directory, register skills, then install them into one or more agent targets.

## Requirements

- Node.js 18.17 or later
- pnpm (recommended for local development)

## Install

Install from the private registry (configure the scope first):

```bash
npm config set @lion1ou:registry https://npm.n.lion1ou.tech:16666/
npm install -g @lion1ou/skill-ctl
```

Global install provides the `skill-ctl` command. You can also run it without installing:

```bash
npx @lion1ou/skill-ctl
```

The skill catalog (e.g. `lion1ou-skills`) is not bundled. Point init at a local path or git URL: `skill-ctl init --source <path-or-git-url>`. See [`../PRIVATE-NPM.md`](../PRIVATE-NPM.md).

For local development:

```bash
git clone https://github.com/lion1ou/skillctl.git
cd skillctl
pnpm install
pnpm build
npm link
```

## Initialize

The skill source may be a local absolute path or a git remote (`https://`, `git@`, `ssh://`). A remote is cloned to `~/.config/skillctl/sources/<owner>/<repo>`, and `sourceRemote` is stored in the config. Interactive init asks for the source first, then the cache directory. If a local config already exists, you can keep it or overwrite it.

```bash
skill-ctl init --source /absolute/path/to/catalog --cache /absolute/path/to/cache
skill-ctl init --source https://github.com/owner/skill-catalog.git
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

`manage` starts a local dashboard on `127.0.0.1`. The top bar switches between Installed skills and Catalog.

```bash
skill-ctl manage
skill-ctl manage --port 4173 --no-open
```

**Installed skills `/`**

- Scans the user home directory by default, and can fill an absolute path from the native directory picker before adding a project Workspace. The source field accepts an absolute path or git URL; the cache field and directory pickers still use local paths and are not saved until you confirm. Each Workspace is scanned using the Agent-specific subdirectories; only Agents with skills or explicitly pinned by the user are shown. Adding or pinning an Agent creates its skills directory when missing.
- Installs and management changes write a commit-friendly `.skillctl/workspace.json` under the Workspace root (SSH `sourceRemote`, pinned Agents, installed skills). Re-adding that directory restores pins and auto-installs missing skills. If the CLI is not initialized yet and the current directory has this file, its `sourceRemote` can complete source setup.
- The top-right Install button opens a category dialog and installs into the current Agent under the current Workspace. The enable/disable control on a card renames `SKILL.md` ↔ `SKILL.md.disable`.
- Click a Skill card to open its detail page, which reads the landed `SKILL.md` in that Workspace/Agent (`SKILL.md.disable` when disabled). YAML frontmatter and Markdown body are shown separately. The enable/disable control does not open detail.
- Removing a Workspace only removes the management entry; it never deletes project files. The user home Workspace cannot be removed.
- Removing an Agent's skills deletes that Agent's skills directory in the current Workspace and unpins it. If the directory itself is a symlink, only the link is removed.
- The page filters by name, enabled state, broken links, symlinks, or copies. It places enabled skills before disabled ones and refreshes filesystem state every three seconds. Selected skills in the current result can be deleted together: a symlink removes only the link, a copy removes the installed directory, and the source is kept. One failure does not stop the rest.
- A broken symlink can be restored by choosing a new source directory. That directory must exist and contain `SKILL.md` or `SKILL.md.disable`. The missing old source is left untouched.
- Workspace paths and pinned Agents are stored in `~/.config/skillctl/config.json`.

**Catalog `/catalog`**

- Visually edit `skillctl-skills.json` and `skillctl-categories.json`. Change category, description, and install-time `enabled`, and sync unregistered local skills from the source directory. This switch only affects `install`, not files already installed.
- Click a card to open detail for the registered skill's source `SKILL.md`. Uncached external skills show as not prepared; the page does not download them automatically.
- Deleting a catalog entry removes the registry record only; source files are not deleted.

**Shared rules**

- Detail pages show only `SKILL.md` (or the disabled filename), not other files in the skill directory. Read paths must stay inside a managed Workspace, the local source directory, or the external cache root.
- Toggling a symlinked installed skill modifies its real source and affects other links to that source, so the page asks for confirmation.
- The service only binds to the loopback address and protects its API with a random per-process token.
- The dashboard pages load a small analytics script from `track.lion1ou.tech` that reports anonymous page views, front-end errors and performance timings (app name `skillctl`). It never sends skill content, file paths or the access token. Set `SKILLCTL_NO_TELEMETRY=1` to disable it entirely; the pages then keep a strict CSP with no third-party origins.

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

Release notes are in [CHANGELOG.md](CHANGELOG.md). To publish `@lion1ou/skill-ctl@1.2.0` yourself after committing:

```bash
pnpm test
pnpm run publish:npm
```
