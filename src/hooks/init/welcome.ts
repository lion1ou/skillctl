import type { Hook } from '@oclif/core';

const hook: Hook<'init'> = async function (opts) {
  if (opts.id !== undefined) return;
  if (opts.argv.length > 0) return;

  await opts.config.runCommand('welcome', []);
  process.exit(0);
};

export default hook;
