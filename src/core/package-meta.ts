import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** 读取发布包 package.json 中的版本号。 */
export function readPackageVersion(): string {
  const pkgPath = fileURLToPath(new URL('../../package.json', import.meta.url));
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
  return pkg.version ?? '0.0.0';
}

export const VERSION = readPackageVersion();
