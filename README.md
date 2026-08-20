# skillctl

Configuration-driven Agent Skill catalog installer. This project is independent of any catalog repository.

## Initialize

```bash
skillctl init --source /absolute/path/to/catalog --cache /absolute/path/to/cache
```

Source and cache paths must be absolute. Interactive init asks for source first, then cache.

If the source directory has no catalog files, init writes `skillctl-skills.json` (registry) and `skillctl-categories.json` (categories) with two example remote skills. Existing files are not overwritten.

Machine-local mapping is stored at `~/.config/skillctl/config.json`. Non-interactive init requires `--source`; `--cache` defaults to `<skillctl>/.cache`.

## Commands

```bash
skillctl init --source /absolute/path/to/catalog
skillctl add --local
skillctl add <query|owner/repo>
skillctl install
```

`add` only updates the configured catalog. `install` checks all sources, stages missing external skills, then distributes every prepared local directory through the same installation path.

The npm package contains only `bin/` and compiled `dist/`; catalog source files are never bundled.
