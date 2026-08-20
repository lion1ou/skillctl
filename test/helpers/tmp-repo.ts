import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export interface TmpRepo {
  root: string;
  writeFile(rel: string, content: string): void;
  mkdir(rel: string): void;
  cleanup(): void;
}

export function createTmpRepo(prefix = 'skillctl-test-'): TmpRepo {
  const root = mkdtempSync(join(tmpdir(), prefix));
  return {
    root,
    writeFile(rel: string, content: string): void {
      const full = join(root, rel);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content, 'utf8');
    },
    mkdir(rel: string): void {
      mkdirSync(join(root, rel), { recursive: true });
    },
    cleanup(): void {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
