import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

const DEFAULT_REGISTRY = 'https://registry.npmjs.org/';

const result = spawnSync('npm', ['publish', '--registry', readRegistry()], {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);

/** 发布源只读本机偏好，缺省为公网 npm。 */
function readRegistry() {
  const file = preferencesFile();
  if (!file) return DEFAULT_REGISTRY;
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  const registry = typeof parsed.npmRegistry === 'string' ? parsed.npmRegistry.trim() : '';
  if (!registry) return DEFAULT_REGISTRY;
  if (!/^https?:\/\//i.test(registry)) {
    throw new Error(`无效的 npmRegistry：${file}`);
  }
  return registry;
}

function preferencesFile() {
  const explicit = process.env.SKILLCTL_PREFERENCES?.trim();
  if (explicit) {
    const file = isAbsolute(explicit) ? explicit : resolve(explicit);
    if (!existsSync(file)) throw new Error(`偏好文件不存在：${file}`);
    return file;
  }
  const home = process.env.XDG_CONFIG_HOME?.trim()
    ? resolve(process.env.XDG_CONFIG_HOME)
    : join(process.env.HOME ? resolve(process.env.HOME) : homedir(), '.config');
  const file = join(home, 'skillctl', 'preferences.json');
  return existsSync(file) ? file : null;
}
