#!/usr/bin/env node
import { register } from 'tsx/esm/api';

register();

/** 用显式 main 收口退出码，避免 top-level await 在空会话时被 Node 判为 unsettled。 */
async function main() {
  const { runDevSession } = await import('../src/dev-session.ts');
  const code = await runDevSession();
  process.exit(code);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
