import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildUsageRecordHookScript,
  installCursorUsageHook,
  readCursorUsageHookStatus,
  uninstallCursorUsageHook,
} from '../src/core/cursor-usage-hook.js';
import { createTmpRepo } from './helpers/tmp-repo.js';

test('安装 hook 时保留其他命令，卸载时只移除读取记录', () => {
  const repo = createTmpRepo('skillctl-hook-');
  try {
    repo.writeFile('.cursor/hooks.json', JSON.stringify({
      version: 1,
      hooks: {
        preToolUse: [
          { command: 'echo keep', matcher: 'Shell' },
          { command: '/usr/bin/node /old/skill-read-probe.mjs', matcher: 'Read' },
        ],
      },
    }));
    repo.writeFile('skill-template/SKILL.md', '---\nname: skillctl-usage\n---\n# usage\n');
    repo.writeFile('.cursor/skills/skillctl-usage/SKILL.md', 'legacy\n');
    const installed = installCursorUsageHook({
      homeDir: repo.root,
      nodePath: '/usr/bin/node',
      cliEntry: '/opt/skill-ctl/bin/run.js',
      skillTemplateDir: join(repo.root, 'skill-template'),
    });
    assert.equal(installed.hookInstalled, true);
    assert.equal(installed.codexHookInstalled, true);
    assert.equal(installed.skillInstalled, true);
    assert.equal(installed.skillPath, join(repo.root, '.agents/skills/skillctl-usage'));
    assert.equal(existsSync(join(repo.root, '.cursor/skills/skillctl-usage/SKILL.md')), false);
    const hooks = JSON.parse(readFileSync(installed.hooksPath, 'utf8')) as {
      hooks: { preToolUse: { command: string; matcher?: string }[] };
    };
    assert.deepEqual(hooks.hooks.preToolUse.map((hook) => hook.command), [
      'echo keep',
      `/usr/bin/node ${join(repo.root, '.cursor/hooks/skillctl-usage-record.mjs')}`,
    ]);
    assert.equal(hooks.hooks.preToolUse.at(-1)?.matcher, 'Read|Shell|Grep');
    assert.match(readFileSync(installed.scriptPath, 'utf8'), /usage record/);
    assert.match(readFileSync(join(installed.skillPath, 'SKILL.md'), 'utf8'), /skillctl-usage/);

    const removed = uninstallCursorUsageHook(repo.root);
    assert.equal(removed.hookInstalled, false);
    assert.equal(removed.codexHookInstalled, false);
    assert.equal(removed.skillInstalled, false);
    const after = JSON.parse(readFileSync(removed.hooksPath, 'utf8')) as {
      hooks: { preToolUse?: { command: string }[] };
    };
    assert.deepEqual(after.hooks.preToolUse, [{ command: 'echo keep', matcher: 'Shell' }]);
    assert.equal(readCursorUsageHookStatus(repo.root).hookInstalled, false);
    assert.equal(readCursorUsageHookStatus(repo.root).codexHookInstalled, false);
  } finally {
    repo.cleanup();
  }
});

test('安装 Codex hook 时保留其他命令，卸载时只移除读取记录', () => {
  const repo = createTmpRepo('skillctl-codex-hook-');
  try {
    repo.writeFile('.codex/hooks.json', JSON.stringify({
      hooks: {
        PreToolUse: [
          { matcher: '^Bash$', hooks: [{ type: 'command', command: 'echo keep' }] },
        ],
      },
    }));
    repo.writeFile('skill-template/SKILL.md', '---\nname: skillctl-usage\n---\n# usage\n');
    const installed = installCursorUsageHook({
      homeDir: repo.root,
      nodePath: '/usr/bin/node',
      cliEntry: '/opt/skill-ctl/bin/run.js',
      skillTemplateDir: join(repo.root, 'skill-template'),
    });
    const hooks = JSON.parse(readFileSync(installed.codexHooksPath, 'utf8')) as {
      hooks: { PreToolUse: { matcher?: string; hooks: { command: string }[] }[] };
    };
    assert.deepEqual(hooks.hooks.PreToolUse.map((group) => group.hooks.map((hook) => hook.command)), [
      ['echo keep'],
      [`/usr/bin/node ${join(repo.root, '.cursor/hooks/skillctl-usage-record.mjs')}`],
    ]);
    assert.equal(hooks.hooks.PreToolUse[1]?.matcher, '^(?:Read|Shell|Grep|Bash|exec)$');

    const removed = uninstallCursorUsageHook(repo.root);
    const after = JSON.parse(readFileSync(removed.codexHooksPath, 'utf8')) as {
      hooks: { PreToolUse?: { hooks: { command: string }[] }[] };
    };
    assert.deepEqual(after.hooks.PreToolUse, [
      { matcher: '^Bash$', hooks: [{ type: 'command', command: 'echo keep' }] },
    ]);
    assert.equal(removed.codexHookInstalled, false);
  } finally {
    repo.cleanup();
  }
});

test('hook 脚本识别 file_path 并调用 usage record，同时始终放行', () => {
  const repo = createTmpRepo('skillctl-hook-script-');
  const recorder = join(repo.root, 'recorder.mjs');
  const argsFile = join(repo.root, 'args.json');
  repo.writeFile('recorder.mjs', `
import { writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)));
`);
  const script = join(repo.root, 'hook.mjs');
  repo.writeFile('hook.mjs', buildUsageRecordHookScript(process.execPath, recorder));
  const run = spawnSync(process.execPath, [script], {
    input: JSON.stringify({
      conversation_id: 'conv-1',
      tool_input: { file_path: '/Users/me/.cursor/skills/create-hook/SKILL.md' },
    }),
    encoding: 'utf8',
  });
  try {
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, '{"permission":"allow"}\n');
    assert.deepEqual(JSON.parse(readFileSync(argsFile, 'utf8')), [
      'usage',
      'record',
      '--name',
      'create-hook',
      '--path',
      '/Users/me/.cursor/skills/create-hook/SKILL.md',
      '--conversation',
      'conv-1',
      '--quiet',
    ]);
  } finally {
    repo.cleanup();
  }
});

test('Codex hook 从 Read 或 Bash 命令里记录 SKILL.md，并且不输出放行 JSON', () => {
  const repo = createTmpRepo('skillctl-codex-hook-script-');
  const recorder = join(repo.root, 'recorder.mjs');
  const argsFile = join(repo.root, 'args.jsonl');
  repo.writeFile('recorder.mjs', `
import { appendFileSync } from 'node:fs';
appendFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)) + '\\n');
`);
  const script = join(repo.root, 'hook.mjs');
  repo.writeFile('hook.mjs', buildUsageRecordHookScript(process.execPath, recorder));
  const run = spawnSync(process.execPath, [script], {
    input: JSON.stringify({
      session_id: 'sess-1',
      hook_event_name: 'PreToolUse',
      tool_name: 'exec',
      tool_input: {
        command: 'cat /Users/me/.agents/skills/skillctl-usage/SKILL.md /Users/me/.codex/skills/.system/openai-docs/SKILL.md',
      },
    }),
    encoding: 'utf8',
  });
  try {
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, '');
    assert.deepEqual(readFileSync(argsFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line)), [
      ['usage', 'record', '--name', 'skillctl-usage', '--path', '/Users/me/.agents/skills/skillctl-usage/SKILL.md', '--conversation', 'sess-1', '--quiet'],
      ['usage', 'record', '--name', 'openai-docs', '--path', '/Users/me/.codex/skills/.system/openai-docs/SKILL.md', '--conversation', 'sess-1', '--quiet'],
    ]);
  } finally {
    repo.cleanup();
  }
});

test('同一条 shell 命令里的 SKILL.md 和 references 按文件各计一次', () => {
  const repo = createTmpRepo('skillctl-shell-hook-script-');
  const recorder = join(repo.root, 'recorder.mjs');
  const argsFile = join(repo.root, 'args.jsonl');
  repo.writeFile('recorder.mjs', `
import { appendFileSync } from 'node:fs';
appendFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)) + '\\n');
`);
  const script = join(repo.root, 'hook.mjs');
  repo.writeFile('hook.mjs', buildUsageRecordHookScript(process.execPath, recorder));
  const run = spawnSync(process.execPath, [script], {
    input: JSON.stringify({
      conversation_id: 'conv-2',
      tool_input: {
        command: 'cat /Users/me/.agents/skills/foo/SKILL.md /Users/me/.agents/skills/foo/references/coding-baseline.md /Users/me/.agents/skills/bar/scripts/run.sh',
      },
    }),
    encoding: 'utf8',
  });
  try {
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(readFileSync(argsFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line)), [
      ['usage', 'record', '--name', 'foo', '--path', '/Users/me/.agents/skills/foo/references/coding-baseline.md', '--conversation', 'conv-2', '--count', '2', '--quiet'],
      ['usage', 'record', '--name', 'bar', '--path', '/Users/me/.agents/skills/bar/scripts/run.sh', '--conversation', 'conv-2', '--quiet'],
    ]);
  } finally {
    repo.cleanup();
  }
});

test('shell 中的目录、变量、花括号和通配符不记为读取', () => {
  const repo = createTmpRepo('skillctl-shell-literal-');
  const recorder = join(repo.root, 'recorder.mjs');
  const argsFile = join(repo.root, 'args.jsonl');
  repo.writeFile('recorder.mjs', `
import { appendFileSync } from 'node:fs';
appendFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)) + '\\n');
`);
  const script = join(repo.root, 'hook.mjs');
  repo.writeFile('hook.mjs', buildUsageRecordHookScript(process.execPath, recorder));
  const run = spawnSync(process.execPath, [script], {
    input: JSON.stringify({
      conversation_id: 'conv-3',
      tool_input: {
        command: 'ls skills/lion1ou-writing-workflow; cat skills/lion1ou-writing-workflow/references/produce.md skills/lion1ou-writing-$s $HOME/.agents/skills/$s/SKILL.md skills/lion1ou-writing-{life,author,personal}/SKILL.md',
      },
    }),
    encoding: 'utf8',
  });
  try {
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(readFileSync(argsFile, 'utf8').trim()), [
      'usage', 'record', '--name', 'lion1ou-writing-workflow',
      '--path', 'skills/lion1ou-writing-workflow/references/produce.md',
      '--conversation', 'conv-3', '--quiet',
    ]);
  } finally {
    repo.cleanup();
  }
});
