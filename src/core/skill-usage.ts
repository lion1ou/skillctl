import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { resolveCliConfigPath } from './cli-config.js';

const CONVERSATION_LIMIT = 400;
const LOCK_TIMEOUT_MS = 2_000;
const LOCK_STALE_MS = 10_000;

export interface SkillUsageEntry {
  path: string;
  readCount: number;
  lastReadAt: string;
  conversationIds: string[];
  /** 本地日历日 → 当天新增的读取次数。只在实际记录时写入。 */
  daily?: Record<string, number>;
}

export interface SkillUsageFile {
  version: 1;
  skills: Record<string, SkillUsageEntry>;
}

export interface SkillUsageSummaryItem {
  name: string;
  path: string;
  readCount: number;
  lastReadAt: string;
}

export interface SkillUsageDay {
  day: string;
  count: number;
}

export interface SkillUsageSummary {
  readCount: number;
  skillCount: number;
  skills: SkillUsageSummaryItem[];
  daily: SkillUsageDay[];
}

/** 本机 skill 读取记录，与 skillctl 配置放在同一目录。 */
export function resolveSkillUsagePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(dirname(resolveCliConfigPath(env)), 'usage.json');
}

export const USAGE_SKILL_NAME_PATTERN = /^[\p{L}\p{N}_][\p{L}\p{N}_.-]{0,127}$/u;
export const TTFUND_VERSIONED_SKILL_PATH = /(?:^|\/)ttfund-skills\/skills\/[^/]+\/\d+\.\d+\.\d+\//;

const SHELL_META = /[$*?{}`]/;

/** 从 skills 或 skills-cursor 下的具体文件取出 skill 名。目录、变量、花括号和通配符不算。 */
export function skillNameFromReadPath(filePath: string): string | null {
  if (!filePath) return null;
  const normalized = filePath.replaceAll('\\', '/');
  if (TTFUND_VERSIONED_SKILL_PATH.test(normalized)) return null;
  const match = normalized.match(/(?:^|\/)(?:skills|skills-cursor)\/(.+)$/);
  if (!match) return null;
  const parts = match[1].split('/').filter((part) => part.length > 0);
  if (parts[0]?.startsWith('.')) parts.shift();
  const file = parts.at(-1);
  if (!file?.includes('.') || parts.some((part) => SHELL_META.test(part))) return null;
  const name = parts[0];
  if (!name || name === 'SKILL.md' || !USAGE_SKILL_NAME_PATTERN.test(name)) return null;
  return name;
}

const PATH_SEPARATORS = new Set([' ', '\t', '\n', '\r', '"', "'", '`', ';', '|', '&', '<', '>']);

/** 从工具参数里找出具体 skill 文件。同一 skill 在同一段文本里的多次出现合并计数。 */
export function skillUsesInText(source: string): { name: string; path: string; count: number }[] {
  if (!source) return [];
  const text = source.replaceAll('\\', '/');
  const grouped = new Map<string, { name: string; path: string; count: number }>();
  const marker = /skills(?:-cursor)?\//g;
  let found: RegExpExecArray | null;
  while ((found = marker.exec(text))) {
    let start = found.index;
    while (start > 0 && !PATH_SEPARATORS.has(text[start - 1] ?? '')) start -= 1;
    let end = found.index + found[0].length;
    while (end < text.length && !PATH_SEPARATORS.has(text[end] ?? '')) end += 1;
    const path = text.slice(start, end).replace(/[),:;]+$/, '');
    marker.lastIndex = end;
    const name = skillNameFromReadPath(path);
    if (!name) continue;
    const current = grouped.get(name) ?? { name, path, count: 0 };
    current.count += 1;
    current.path = path;
    grouped.set(name, current);
  }
  return [...grouped.values()];
}

/** 按 skill 名累计读取次数。同一次会话里的每次读取都计入。 */
export function recordSkillRead(options: {
  name: string;
  path: string;
  conversationId?: string;
  count?: number;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
}): { recorded: boolean; readCount: number; name: string } {
  const name = normalizeSkillName(options.name);
  if (typeof options.path !== 'string' || !options.path.trim()) {
    throw new Error('skill 路径不能为空');
  }
  const path = options.path.trim();
  if (!USAGE_SKILL_NAME_PATTERN.test(name) || TTFUND_VERSIONED_SKILL_PATH.test(path.replaceAll('\\', '/'))) {
    return { recorded: false, readCount: 0, name };
  }
  const count = normalizeReadCount(options.count);
  const conversationId = options.conversationId?.trim() || `manual:${randomUUID()}`;
  const readAt = (options.now ?? (() => new Date()))().toISOString();
  const file = resolveSkillUsagePath(options.env);
  return withUsageLock(file, () => {
    const usage = readUsageFile(file);
    const current = usage.skills[name];
    const conversationIds = current?.conversationIds.includes(conversationId)
      ? current.conversationIds
      : [...(current?.conversationIds ?? []), conversationId].slice(-CONVERSATION_LIMIT);
    const day = localUsageDay(new Date(readAt));
    const daily = current?.daily ? { ...current.daily } : {};
    if (!current?.daily && current?.readCount === 1) {
      const previousDay = localUsageDay(new Date(current.lastReadAt));
      if (previousDay) daily[previousDay] = 1;
    }
    if (day) daily[day] = (daily[day] ?? 0) + count;
    const days = Object.keys(daily).sort();
    while (days.length > 366) {
      const oldest = days.shift();
      if (oldest) delete daily[oldest];
    }
    usage.skills[name] = {
      path,
      readCount: (current?.readCount ?? 0) + count,
      lastReadAt: readAt,
      conversationIds,
      daily,
    };
    writeUsageFile(file, usage);
    return { recorded: true, readCount: usage.skills[name].readCount, name };
  });
}

/** 汇总全部 skill 的读取次数，按次数从高到低。 */
export function readSkillUsageSummary(env: NodeJS.ProcessEnv = process.env): SkillUsageSummary {
  const usage = readUsageFile(resolveSkillUsagePath(env));
  const entries = Object.entries(usage.skills).filter(([name, entry]) =>
    USAGE_SKILL_NAME_PATTERN.test(name) && !TTFUND_VERSIONED_SKILL_PATH.test(entry.path.replaceAll('\\', '/')));
  const skills = entries
    .map(([name, entry]) => ({
      name,
      path: entry.path,
      readCount: entry.readCount,
      lastReadAt: entry.lastReadAt,
    }))
    .sort((left, right) => right.readCount - left.readCount || left.name.localeCompare(right.name));
  const totals = new Map<string, number>();
  for (const [, entry] of entries) {
    for (const [day, count] of Object.entries(usageDays(entry))) {
      totals.set(day, (totals.get(day) ?? 0) + count);
    }
  }
  return {
    readCount: skills.reduce((total, skill) => total + skill.readCount, 0),
    skillCount: skills.length,
    skills,
    daily: [...totals.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([day, count]) => ({ day, count })),
  };
}

/** 读取单个 skill 的累计次数；没有记录时返回 null。 */
export function readSkillUsage(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): SkillUsageSummaryItem | null {
  const normalized = normalizeSkillName(name);
  return readSkillUsageSummary(env).skills.find((skill) => skill.name === normalized) ?? null;
}

function localUsageDay(date: Date): string {
  if (Number.isNaN(date.getTime())) return '';
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** 已写入的按天次数优先；升级前仅有一次读取时，用最近读取日补这一点。 */
function usageDays(entry: SkillUsageEntry): Record<string, number> {
  const stored = entry.daily;
  if (stored && typeof stored === 'object') {
    const days: Record<string, number> = {};
    for (const [day, count] of Object.entries(stored)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isInteger(count) && count > 0) days[day] = count;
    }
    if (Object.keys(days).length > 0) return days;
  }
  if (entry.readCount === 1) {
    const day = localUsageDay(new Date(entry.lastReadAt));
    if (day) return { [day]: 1 };
  }
  return {};
}

function normalizeReadCount(count: number | undefined): number {
  if (count === undefined) return 1;
  if (!Number.isInteger(count) || count < 1 || count > 1000) {
    throw new Error('读取次数必须是 1 到 1000 的整数');
  }
  return count;
}

function normalizeSkillName(name: string): string {
  const trimmed = name.trim();
  const length = Array.from(trimmed).length;
  if (length < 1 || length > 128) throw new Error('skill 名称必须包含 1 到 128 个字符');
  return trimmed;
}

function readUsageFile(file: string): SkillUsageFile {
  if (!existsSync(file)) return { version: 1, skills: {} };
  let parsed: Partial<SkillUsageFile>;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<SkillUsageFile>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`无法读取 skill 使用记录 ${file}：${message}`);
  }
  if (parsed.version !== 1 || !parsed.skills || typeof parsed.skills !== 'object') {
    throw new Error(`无效的 skill 使用记录：${file}`);
  }
  return { version: 1, skills: parsed.skills };
}

function writeUsageFile(file: string, usage: SkillUsageFile): void {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(usage, null, 2)}\n`, 'utf8');
  renameSync(temporary, file);
}

function withUsageLock<T>(file: string, action: () => T): T {
  const lock = `${file}.lock`;
  mkdirSync(dirname(file), { recursive: true });
  const started = Date.now();
  let acquired = false;
  while (!acquired) {
    try {
      mkdirSync(lock);
      acquired = true;
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw error;
      const stale = existsSync(lock) && Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS;
      if (stale) {
        rmSync(lock, { recursive: true, force: true });
        continue;
      }
      if (Date.now() - started > LOCK_TIMEOUT_MS) {
        throw new Error(`skill 使用记录正被占用：${file}`);
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
  try {
    return action();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}
