import { copyFileSync, existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { resolveCliPackageRoot } from './cli-config.js';
import { TTFUND_VERSIONED_SKILL_PATH, USAGE_SKILL_NAME_PATTERN } from './skill-usage.js';

interface CursorHookCommand {
  command: string;
  matcher?: string;
  timeout?: number;
  failClosed?: boolean;
}

interface CursorHooksFile {
  version: number;
  hooks: Record<string, CursorHookCommand[]>;
}

export interface CursorUsageHookStatus {
  hookInstalled: boolean;
  codexHookInstalled: boolean;
  claudeHookInstalled: boolean;
  skillInstalled: boolean;
  hooksPath: string;
  codexHooksPath: string;
  claudeHooksPath: string;
  scriptPath: string;
  skillPath: string;
  claudeSkillPath: string;
}

interface CodexHookHandler {
  type?: string;
  command?: string;
  timeout?: number;
}

interface CodexMatcherGroup {
  matcher?: string;
  hooks: CodexHookHandler[];
}

interface CodexHooksFile {
  hooks: Record<string, CodexMatcherGroup[]>;
}

const HOOK_SCRIPT_NAME = 'skillctl-usage-record.mjs';
const PREVIOUS_PROBE = 'skill-read-probe.mjs';
const USAGE_SKILL_NAME = 'skillctl-usage';
const CURSOR_READ_MATCHER = 'Read|Shell|Grep';
const CODEX_READ_MATCHER = '^(?:Read|Shell|Grep|Bash|exec)$';
const CLAUDE_READ_MATCHER = '^(?:Read|Grep|Bash)$';

/** 生成只记录、不拦截读取的 Cursor / Codex hook 脚本。 */
export function buildUsageRecordHookScript(nodePath: string, cliEntry: string): string {
  return `#!/usr/bin/env node
import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const nodePath = ${JSON.stringify(nodePath)};
const cliEntry = ${JSON.stringify(cliEntry)};

function hasShellMeta(part) {
  return part.includes('$') || part.includes('*') || part.includes('?') || part.includes('{') || part.includes('}') || part.includes('\`');
}

function skillName(filePath) {
  if (${TTFUND_VERSIONED_SKILL_PATH}.test(filePath)) return '';
  const match = filePath.match(/(?:^|\\/)(?:skills|skills-cursor)\\/(.+)$/);
  if (!match) return '';
  const parts = match[1].split('/').filter((part) => part.length > 0);
  if (parts[0] && parts[0].startsWith('.')) parts.shift();
  const file = parts[parts.length - 1] || '';
  if (!file.includes('.') || parts.some(hasShellMeta)) return '';
  const name = parts[0] || '';
  return name !== 'SKILL.md' && ${USAGE_SKILL_NAME_PATTERN}.test(name) ? name : '';
}

function skillReads(filePath) {
  const text = String(filePath).replaceAll('\\\\', '/');
  const grouped = new Map();
  const marker = /skills(?:-cursor)?\\//g;
  let found;
  while ((found = marker.exec(text))) {
    let start = found.index;
    while (start > 0 && !isPathSeparator(text[start - 1])) start -= 1;
    let end = found.index + found[0].length;
    while (end < text.length && !isPathSeparator(text[end])) end += 1;
    const path = text.slice(start, end).replace(/[),:;]+$/, '');
    marker.lastIndex = end;
    const name = skillName(path);
    if (!name) continue;
    const current = grouped.get(name) || { name, path, count: 0 };
    current.count += 1;
    current.path = path;
    grouped.set(name, current);
  }
  return [...grouped.values()];
}

function isPathSeparator(char) {
  return char === ' ' || char === '\\t' || char === '\\n' || char === '\\r' || char === '"' || char === "'" || char === '\`' || char === ';' || char === '|' || char === '&' || char === '<' || char === '>';
}

function readPath(payload) {
  const toolInput = typeof payload.tool_input === 'string'
    ? parseToolInput(payload.tool_input)
    : payload.tool_input;
  if (typeof toolInput === 'string') return toolInput;
  if (!toolInput || typeof toolInput !== 'object') return '';
  for (const key of ['path', 'file_path', 'target_file', 'command', 'cmd']) {
    if (typeof toolInput[key] === 'string' && toolInput[key]) return toolInput[key];
  }
  return '';
}

function useSessionId(payload) {
  return typeof payload.session_id === 'string' && typeof payload.conversation_id !== 'string';
}

function parseToolInput(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    logHook(error instanceof Error ? error.message : String(error));
    return null;
  }
}

function logHook(message) {
  const file = join(homedir(), '.config', 'skillctl', 'usage-hook.log');
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, new Date().toISOString() + ' ' + message + '\\n');
}

const chunks = [];
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const source = readPath(payload);
    const conversationId = useSessionId(payload)
      ? payload.session_id.trim()
      : (typeof payload.conversation_id === 'string' ? payload.conversation_id.trim() : '');
    if (source && conversationId) {
      for (const read of skillReads(source)) {
        const args = [
          cliEntry, 'usage', 'record',
          '--name', read.name,
          '--path', read.path,
          '--conversation', conversationId,
        ];
        if (read.count > 1) args.push('--count', String(read.count));
        args.push('--quiet');
        const result = spawnSync(nodePath, args, { timeout: 2500, stdio: 'ignore' });
        if (result.error) logHook(result.error.message);
        else if (result.status) logHook('usage record exit ' + result.status);
      }
    }
    if (!useSessionId(payload)) process.stdout.write('{"permission":"allow"}\\n');
  } catch (error) {
    logHook(error instanceof Error ? error.message : String(error));
    process.stdout.write('{"permission":"allow"}\\n');
  }
});
`;
}

/** 把读取记录 hook 安装到 Cursor、Codex 和 Claude，并放入 skillctl-usage。 */
export function installCursorUsageHook(options: {
  homeDir?: string;
  nodePath: string;
  cliEntry: string;
  skillTemplateDir?: string;
}): CursorUsageHookStatus {
  const homeDir = options.homeDir ?? homedir();
  const paths = hookPaths(homeDir);
  mkdirSync(dirname(paths.scriptPath), { recursive: true });
  writeFileSync(paths.scriptPath, buildUsageRecordHookScript(options.nodePath, options.cliEntry), 'utf8');
  const hooks = readHooksFile(paths.hooksPath);
  const commands = (hooks.hooks.preToolUse ?? []).filter((hook) => !isManagedHook(hook.command));
  commands.push({
    command: `${options.nodePath} ${paths.scriptPath}`,
    matcher: CURSOR_READ_MATCHER,
    timeout: 3,
  });
  hooks.hooks.preToolUse = commands;
  writeHooksFile(paths.hooksPath, hooks);
  const command = `${options.nodePath} ${paths.scriptPath}`;
  installCodexUsageHook(homeDir, command);
  installClaudeUsageHook(homeDir, command);
  const template = options.skillTemplateDir ?? join(resolveCliPackageRoot(), 'skills', USAGE_SKILL_NAME);
  const templateFile = join(template, 'SKILL.md');
  if (!existsSync(templateFile)) throw new Error(`缺少读取记录 skill：${templateFile}`);
  mkdirSync(paths.skillPath, { recursive: true });
  copyFileSync(templateFile, join(paths.skillPath, 'SKILL.md'));
  mkdirSync(paths.claudeSkillPath, { recursive: true });
  copyFileSync(templateFile, join(paths.claudeSkillPath, 'SKILL.md'));
  removeLegacyCursorSkill(homeDir);
  return readCursorUsageHookStatus(homeDir);
}

/** 查看 hook 与 skillctl-usage skill 是否已安装。 */
export function readCursorUsageHookStatus(homeDir = homedir()): CursorUsageHookStatus {
  const paths = hookPaths(homeDir);
  const hooks = existsSync(paths.hooksPath) ? readHooksFile(paths.hooksPath) : emptyHooks();
  const hookInstalled = (hooks.hooks.preToolUse ?? []).some((hook) => hook.command.includes(HOOK_SCRIPT_NAME));
  const codex = existsSync(paths.codexHooksPath) ? readCodexHooksFile(paths.codexHooksPath) : emptyCodexHooks();
  const codexHookInstalled = (codex.hooks.PreToolUse ?? []).some((group) => group.hooks.some((hook) => isManagedCommand(hook.command)));
  const claudeHookInstalled = claudePreToolUse(paths.claudeHooksPath).some((group) => group.hooks.some((hook) => isManagedCommand(hook.command)));
  return {
    hookInstalled,
    codexHookInstalled,
    claudeHookInstalled,
    skillInstalled: existsSync(join(paths.skillPath, 'SKILL.md')),
    ...paths,
  };
}

/** 移除 skill-ctl 安装的读取记录 hook 和 skillctl-usage 的 SKILL.md。 */
export function uninstallCursorUsageHook(homeDir = homedir()): CursorUsageHookStatus {
  const paths = hookPaths(homeDir);
  if (existsSync(paths.hooksPath)) {
    const hooks = readHooksFile(paths.hooksPath);
    if (hooks.hooks.preToolUse) {
      hooks.hooks.preToolUse = hooks.hooks.preToolUse.filter((hook) => !isManagedHook(hook.command));
      if (hooks.hooks.preToolUse.length === 0) delete hooks.hooks.preToolUse;
    }
    writeHooksFile(paths.hooksPath, hooks);
  }
  uninstallCodexUsageHook(homeDir);
  uninstallClaudeUsageHook(homeDir);
  rmSync(paths.scriptPath, { force: true });
  removeSkillDirectory(paths.skillPath);
  removeSkillDirectory(paths.claudeSkillPath);
  removeLegacyCursorSkill(homeDir);
  return readCursorUsageHookStatus(homeDir);
}

function hookPaths(homeDir: string): Pick<CursorUsageHookStatus, 'hooksPath' | 'codexHooksPath' | 'claudeHooksPath' | 'scriptPath' | 'skillPath' | 'claudeSkillPath'> {
  return {
    hooksPath: join(homeDir, '.cursor', 'hooks.json'),
    codexHooksPath: join(homeDir, '.codex', 'hooks.json'),
    claudeHooksPath: join(homeDir, '.claude', 'settings.json'),
    scriptPath: join(homeDir, '.cursor', 'hooks', HOOK_SCRIPT_NAME),
    skillPath: join(homeDir, '.agents', 'skills', USAGE_SKILL_NAME),
    claudeSkillPath: join(homeDir, '.claude', 'skills', USAGE_SKILL_NAME),
  };
}

function installCodexUsageHook(homeDir: string, command: string): void {
  const file = join(homeDir, '.codex', 'hooks.json');
  const hooks = readCodexHooksFile(file);
  const groups = withoutManagedCodexHooks(hooks.hooks.PreToolUse ?? []);
  groups.push({
    matcher: CODEX_READ_MATCHER,
    hooks: [{ type: 'command', command, timeout: 3 }],
  });
  hooks.hooks.PreToolUse = groups;
  writeCodexHooksFile(file, hooks);
}

function installClaudeUsageHook(homeDir: string, command: string): void {
  const file = join(homeDir, '.claude', 'settings.json');
  const settings = readClaudeSettings(file);
  const hooks = claudeHookTable(settings, file);
  const groups = withoutManagedCodexHooks(claudeGroups(hooks.PreToolUse, file));
  groups.push({
    matcher: CLAUDE_READ_MATCHER,
    hooks: [{ type: 'command', command, timeout: 3 }],
  });
  hooks.PreToolUse = groups;
  settings.hooks = hooks;
  writeJsonFile(file, settings);
}

function uninstallClaudeUsageHook(homeDir: string): void {
  const file = join(homeDir, '.claude', 'settings.json');
  if (!existsSync(file)) return;
  const settings = readClaudeSettings(file);
  if (settings.hooks === undefined) return;
  const hooks = claudeHookTable(settings, file);
  const groups = withoutManagedCodexHooks(claudeGroups(hooks.PreToolUse, file));
  if (groups.length === 0) delete hooks.PreToolUse;
  else hooks.PreToolUse = groups;
  if (Object.keys(hooks).length === 0) delete settings.hooks;
  else settings.hooks = hooks;
  writeJsonFile(file, settings);
}

function claudePreToolUse(file: string): CodexMatcherGroup[] {
  if (!existsSync(file)) return [];
  const settings = readClaudeSettings(file);
  if (settings.hooks === undefined) return [];
  return claudeGroups(claudeHookTable(settings, file).PreToolUse, file);
}

function claudeHookTable(settings: Record<string, unknown>, file: string): Record<string, unknown> {
  if (settings.hooks === undefined) return {};
  if (!settings.hooks || typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)) {
    throw new Error(`无效的 Claude 设置：${file}`);
  }
  return { ...(settings.hooks as Record<string, unknown>) };
}

function claudeGroups(value: unknown, file: string): CodexMatcherGroup[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`无效的 Claude 设置：${file}`);
  for (const group of value) {
    if (!group || typeof group !== 'object' || !Array.isArray((group as CodexMatcherGroup).hooks)) {
      throw new Error(`无效的 Claude 设置：${file}`);
    }
  }
  return value as CodexMatcherGroup[];
}

function readClaudeSettings(file: string): Record<string, unknown> {
  if (!existsSync(file)) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`无法读取 Claude 设置：${file}：${message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`无效的 Claude 设置：${file}`);
  }
  return { ...(parsed as Record<string, unknown>) };
}

function writeJsonFile(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function uninstallCodexUsageHook(homeDir: string): void {
  const file = join(homeDir, '.codex', 'hooks.json');
  if (!existsSync(file)) return;
  const hooks = readCodexHooksFile(file);
  const groups = withoutManagedCodexHooks(hooks.hooks.PreToolUse ?? []);
  if (groups.length === 0) delete hooks.hooks.PreToolUse;
  else hooks.hooks.PreToolUse = groups;
  writeCodexHooksFile(file, hooks);
}

function withoutManagedCodexHooks(groups: CodexMatcherGroup[]): CodexMatcherGroup[] {
  return groups
    .map((group) => ({ ...group, hooks: group.hooks.filter((hook) => !isManagedCommand(hook.command)) }))
    .filter((group) => group.hooks.length > 0);
}

function isManagedCommand(command: string | undefined): boolean {
  return typeof command === 'string' && isManagedHook(command);
}

function removeLegacyCursorSkill(homeDir: string): void {
  removeSkillDirectory(join(homeDir, '.cursor', 'skills', USAGE_SKILL_NAME));
}

function removeSkillDirectory(skillPath: string): void {
  rmSync(join(skillPath, 'SKILL.md'), { force: true });
  try {
    rmdirSync(skillPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOTEMPTY' && code !== 'ENOENT') throw error;
  }
}

function isManagedHook(command: string): boolean {
  return command.includes(HOOK_SCRIPT_NAME) || command.includes(PREVIOUS_PROBE);
}

function emptyHooks(): CursorHooksFile {
  return { version: 1, hooks: {} };
}

function readHooksFile(file: string): CursorHooksFile {
  if (!existsSync(file)) return emptyHooks();
  let parsed: Partial<CursorHooksFile>;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<CursorHooksFile>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`无法读取 Cursor hooks：${file}：${message}`);
  }
  if (parsed.version !== 1 || !parsed.hooks || typeof parsed.hooks !== 'object') {
    throw new Error(`无效的 Cursor hooks：${file}`);
  }
  return { version: 1, hooks: parsed.hooks };
}

function writeHooksFile(file: string, hooks: CursorHooksFile): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(hooks, null, 2)}\n`, 'utf8');
}

function emptyCodexHooks(): CodexHooksFile {
  return { hooks: {} };
}

function readCodexHooksFile(file: string): CodexHooksFile {
  if (!existsSync(file)) return emptyCodexHooks();
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`无法读取 Codex hooks：${file}：${message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`无效的 Codex hooks：${file}`);
  }
  const record = parsed as { hooks?: unknown };
  if (!record.hooks || typeof record.hooks !== 'object' || Array.isArray(record.hooks)) {
    throw new Error(`无效的 Codex hooks：${file}`);
  }
  const groups = (record.hooks as { PreToolUse?: unknown }).PreToolUse;
  if (groups !== undefined && !Array.isArray(groups)) throw new Error(`无效的 Codex hooks：${file}`);
  for (const group of groups ?? []) {
    if (!group || typeof group !== 'object' || !Array.isArray((group as CodexMatcherGroup).hooks)) {
      throw new Error(`无效的 Codex hooks：${file}`);
    }
  }
  return record as CodexHooksFile;
}

function writeCodexHooksFile(file: string, hooks: CodexHooksFile): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(hooks, null, 2)}\n`, 'utf8');
}
