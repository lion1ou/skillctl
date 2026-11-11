import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTmpRepo } from './helpers/tmp-repo.js';
import {
  readSkillUsage,
  readSkillUsageSummary,
  recordSkillRead,
  resolveSkillUsagePath,
  skillNameFromReadPath,
  skillUsesInText,
} from '../src/core/skill-usage.js';

test('从 skills 与 skills-cursor 下的任意文件取 skill 名', () => {
  assert.equal(skillNameFromReadPath('/repo/.cursor/skills/demo/SKILL.md'), 'demo');
  assert.equal(skillNameFromReadPath('/home/.cursor/skills-cursor/create-hook/SKILL.md'), 'create-hook');
  assert.equal(skillNameFromReadPath('/repo/.cursor/skills/demo/references/coding-baseline.md'), 'demo');
  assert.equal(skillNameFromReadPath('/repo/.codex/skills/.system/openai-docs/references/guide.md'), 'openai-docs');
  assert.equal(skillNameFromReadPath('/repo/.agents/skills/demo'), null);
  assert.equal(skillNameFromReadPath('skills/lion1ou-writing-$s'), null);
  assert.equal(skillNameFromReadPath('$HOME/.agents/skills/$s/SKILL.md'), null);
  assert.equal(skillNameFromReadPath('skills/lion1ou-writing-{life,author,personal}/SKILL.md'), null);
  assert.equal(skillNameFromReadPath('skills/lion1ou-writing-workflow/{SKILL.md,references/*.md}'), null);
  assert.equal(skillNameFromReadPath('$HOME/.agents/skills/sepia/SKILL.md'), 'sepia');
  assert.equal(skillNameFromReadPath('/repo/README.md'), null);
});

test('同一段命令只保留具体文件，目录和未展开符号不计数', () => {
  assert.deepEqual(skillUsesInText([
    'ls skills/lion1ou-writing-workflow',
    'cat skills/lion1ou-writing-workflow/references/produce.md',
    'skills/lion1ou-writing-$s',
    '$HOME/.agents/skills/$s/SKILL.md',
    'skills/lion1ou-writing-{life,author,personal}/SKILL.md',
    '$HOME/.agents/skills/sepia/SKILL.md',
  ].join(' ')), [
    { name: 'lion1ou-writing-workflow', path: 'skills/lion1ou-writing-workflow/references/produce.md', count: 1 },
    { name: 'sepia', path: '$HOME/.agents/skills/sepia/SKILL.md', count: 1 },
  ]);
});

test('同一会话的每次读取都累计，并按 skill 名汇总', () => {
  const repo = createTmpRepo('skillctl-usage-');
  const env = { XDG_CONFIG_HOME: join(repo.root, 'config') } as NodeJS.ProcessEnv;
  try {
    const first = recordSkillRead({
      name: 'create-hook',
      path: '/skills/create-hook/SKILL.md',
      conversationId: 'conv-1',
      env,
      now: () => new Date('2026-11-06T03:20:39.000Z'),
    });
    const duplicate = recordSkillRead({
      name: 'create-hook',
      path: '/skills/create-hook/SKILL.md',
      conversationId: 'conv-1',
      env,
      now: () => new Date('2026-11-06T03:20:55.000Z'),
    });
    const second = recordSkillRead({
      name: 'demo',
      path: '/skills/demo/SKILL.md',
      conversationId: 'conv-1',
      env,
      now: () => new Date('2026-11-06T04:00:00.000Z'),
    });
    assert.equal(first.recorded, true);
    assert.equal(first.readCount, 1);
    assert.equal(duplicate.recorded, true);
    assert.equal(duplicate.readCount, 2);
    assert.equal(second.readCount, 1);
    const summary = readSkillUsageSummary(env);
    assert.equal(summary.readCount, 3);
    assert.equal(summary.skillCount, 2);
    assert.equal(summary.daily.length, 1);
    assert.equal(summary.daily[0]?.count, 3);
    assert.match(summary.daily[0]?.day ?? '', /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(readSkillUsage('create-hook', env), {
      name: 'create-hook',
      path: '/skills/create-hook/SKILL.md',
      readCount: 2,
      lastReadAt: '2026-11-06T03:20:55.000Z',
    });
    assert.equal(readSkillUsage('missing', env), null);
    const saved = JSON.parse(readFileSync(resolveSkillUsagePath(env), 'utf8')) as {
      skills: Record<string, { readCount: number; daily?: Record<string, number> }>;
    };
    assert.equal(saved.skills['create-hook'].readCount, 2);
    assert.deepEqual(saved.skills['create-hook'].daily, { [summary.daily[0]?.day ?? '']: 2 });
  } finally {
    repo.cleanup();
  }
});

test('一次记录可以计入多次读取', () => {
  const repo = createTmpRepo('skillctl-usage-count-');
  const env = { XDG_CONFIG_HOME: join(repo.root, 'config') } as NodeJS.ProcessEnv;
  try {
    const result = recordSkillRead({
      name: 'demo',
      path: '/skills/demo/references/coding-baseline.md',
      conversationId: 'conv-1',
      count: 2,
      env,
      now: () => new Date('2026-11-06T03:20:39.000Z'),
    });
    assert.equal(result.readCount, 2);
    const summary = readSkillUsageSummary(env);
    assert.equal(summary.readCount, 2);
    assert.equal(summary.daily[0]?.count, 2);
  } finally {
    repo.cleanup();
  }
});

test('按本地日历日累计趋势，升级前只有一次读取时补到最近读取日', () => {
  const repo = createTmpRepo('skillctl-usage-days-');
  const env = { XDG_CONFIG_HOME: join(repo.root, 'config') } as NodeJS.ProcessEnv;
  try {
    recordSkillRead({
      name: 'create-hook',
      path: '/skills/create-hook/SKILL.md',
      conversationId: 'conv-1',
      env,
      now: () => new Date('2026-11-01T12:00:00.000Z'),
    });
    recordSkillRead({
      name: 'create-hook',
      path: '/skills/create-hook/SKILL.md',
      conversationId: 'conv-2',
      env,
      now: () => new Date('2026-11-04T12:00:00.000Z'),
    });
    const summary = readSkillUsageSummary(env);
    assert.deepEqual(summary.daily.map((day) => day.count), [1, 1]);
    assert.notEqual(summary.daily[0]?.day, summary.daily[1]?.day);

    const file = resolveSkillUsagePath(env);
    const saved = JSON.parse(readFileSync(file, 'utf8')) as {
      version: 1;
      skills: Record<string, { path: string; readCount: number; lastReadAt: string; conversationIds: string[] }>;
    };
    saved.skills.once = {
      path: '/skills/once/SKILL.md',
      readCount: 1,
      lastReadAt: '2026-11-02T12:00:00.000Z',
      conversationIds: ['conv-3'],
    };
    saved.skills.many = {
      path: '/skills/many/SKILL.md',
      readCount: 4,
      lastReadAt: '2026-11-03T12:00:00.000Z',
      conversationIds: ['conv-4'],
    };
    writeFileSync(file, JSON.stringify(saved));
    const mixed = readSkillUsageSummary(env);
    assert.equal(mixed.readCount, 7);
    assert.equal(mixed.daily.reduce((total, day) => total + day.count, 0), 3);
    assert.equal(mixed.skills.find((skill) => skill.name === 'many')?.readCount, 4);
  } finally {
    repo.cleanup();
  }
});

test('正则片段和 TTFund 版本化目录不计入 Skill 用量', () => {
  const paths = [
    '/([a-zA-Z0-9_.-]+)/skills/([a-zA-Z0-9_.-]+',
    'skills/[/w-]+/SKILL/.md',
    'Support/TTFund/ttfund-skills/skills/TTFUND_THEME_SELECT/1.0.0/examples/select.json',
  ];
  assert.deepEqual(skillUsesInText(paths.join(' ')), []);
  const repo = createTmpRepo('skillctl-usage-invalid-');
  const env = { XDG_CONFIG_HOME: join(repo.root, 'config') };
  try {
    recordSkillRead({ name: 'demo', path: '/skills/demo/SKILL.md', env });
    const file = resolveSkillUsagePath(env);
    const stored = JSON.parse(readFileSync(file, 'utf8'));
    for (const [index, name] of ['([a-zA-Z0-9_.-]+', '[', 'TTFUND_THEME_SELECT'].entries()) {
      stored.skills[name] = { ...stored.skills.demo, path: paths[index] };
    }
    writeFileSync(file, JSON.stringify(stored));
    const summary = readSkillUsageSummary(env);
    assert.deepEqual(summary.skills.map((skill) => skill.name), ['demo']);
    assert.equal(summary.readCount, 1);
    assert.equal(summary.daily[0]?.count, 1);
  } finally {
    repo.cleanup();
  }
});
