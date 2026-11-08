import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

export interface ProductPreferences {
  gitProtocol: 'https' | 'ssh';
  requireChineseDescription: boolean;
  npmRegistry: string;
}

export const DEFAULT_PRODUCT_PREFERENCES: ProductPreferences = {
  gitProtocol: 'https',
  requireChineseDescription: false,
  npmRegistry: 'https://registry.npmjs.org/',
};

/** 读取本机偏好。未写出的字段使用模板默认值。 */
export function loadProductPreferences(env: NodeJS.ProcessEnv = process.env): ProductPreferences {
  const file = resolvePreferencesFile(env);
  if (!file) return { ...DEFAULT_PRODUCT_PREFERENCES };
  return parsePreferences(file);
}

/** 仅在偏好要求中文、且当前介绍没有汉字时，才提示补写。 */
export function shouldRequestChineseDescription(
  description: string,
  preferences: ProductPreferences,
): boolean {
  if (!preferences.requireChineseDescription) return false;
  return !/[\u4e00-\u9fff]/.test(description);
}

function resolvePreferencesFile(env: NodeJS.ProcessEnv): string | null {
  const explicit = env.SKILLCTL_PREFERENCES?.trim();
  if (explicit) {
    const file = isAbsolute(explicit) ? explicit : resolve(explicit);
    if (!existsSync(file)) throw new Error(`偏好文件不存在：${file}`);
    return file;
  }
  const file = join(configHome(env), 'skillctl', 'preferences.json');
  return existsSync(file) ? file : null;
}

function configHome(env: NodeJS.ProcessEnv): string {
  if (env.XDG_CONFIG_HOME?.trim()) return resolve(env.XDG_CONFIG_HOME);
  return join(env.HOME ? resolve(env.HOME) : homedir(), '.config');
}

function parsePreferences(file: string): ProductPreferences {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`无法读取偏好文件：${file}：${message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`无效的偏好文件：${file}`);
  }
  const record = parsed as Record<string, unknown>;
  return {
    gitProtocol: readProtocol(record.gitProtocol, file),
    requireChineseDescription: readBoolean(record.requireChineseDescription, file),
    npmRegistry: readRegistry(record.npmRegistry, file),
  };
}

function readProtocol(value: unknown, file: string): ProductPreferences['gitProtocol'] {
  if (value === undefined) return DEFAULT_PRODUCT_PREFERENCES.gitProtocol;
  if (value === 'https' || value === 'ssh') return value;
  throw new Error(`无效的 gitProtocol：${file}`);
}

function readBoolean(value: unknown, file: string): boolean {
  if (value === undefined) return DEFAULT_PRODUCT_PREFERENCES.requireChineseDescription;
  if (typeof value === 'boolean') return value;
  throw new Error(`无效的 requireChineseDescription：${file}`);
}

function readRegistry(value: unknown, file: string): string {
  if (value === undefined) return DEFAULT_PRODUCT_PREFERENCES.npmRegistry;
  if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) return value.trim();
  throw new Error(`无效的 npmRegistry：${file}`);
}
