---
name: skillctl-usage
description: 安装、查看和卸载 skill-ctl 的 Cursor 与 Codex skill 读取记录。当用户要求统计 skill 使用、安装或关闭 skill 读取埋点、查看本地 skill 读取次数时使用。
---

# skill-ctl 读取记录

Cursor 或 Codex 读取 skill 文件时，由本机 hook 调用 `skill-ctl usage record` 记到 `~/.config/skillctl/usage.json`。记录按 skill 名累计，同一次会话里的每次读取都计入，不上传。

Cursor 匹配 `Read`、`Shell` 和 `Grep`。Codex 匹配 `Read`、`Shell`、`Grep`、`Bash` 和 `exec`。只统计 `skills/` 或 `skills-cursor/` 下的具体文件，`SKILL.md`、`references/` 和其他带扩展名的文件各计一次。纯目录、未展开的 `$`、花括号和通配符不计。点开头的分组目录（例如 `.system`）不算 skill 名。

## 安装

同时写入 Cursor `preToolUse` hook 和 Codex `PreToolUse` hook，并把本 skill 放到 `~/.agents/skills/skillctl-usage`：

```bash
skill-ctl hook install
```

## 查看

```bash
skill-ctl hook status
skill-ctl usage status
```

管理页的「使用情况」展示全部 skill 的次数。Skill 详情页展示当前 skill 的次数和最近读取时间。

## 卸载

```bash
skill-ctl hook uninstall
```

这会移除 hook、记录脚本和 `skillctl-usage` skill 目录。已写入的 `usage.json` 保留。
