import assert from 'node:assert/strict';
import { existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { CATEGORIES_FILE, MANIFEST_FILE, SKILLS_FILE } from '../src/core/brand.js';
import { installCatalogSkills, resolveCatalogSkills, splitCliLogLines, summarizeExternalPrepareOutput } from '../src/core/catalog-install.js';
import { loadSkillCatalog } from '../src/core/skill-registry.js';
import { createTmpRepo } from './helpers/tmp-repo.js';

test('外部包准备失败时提炼可读错误，而不是 spinner 输出', () => {
  const raw = [
    '\u001B[38;5;250m███████╗\u001B[0m',
    '◇  Source: https://github.com/jimliu/baoyu-skills.git',
    '◐  Cloning repository…',
    '■  Failed to clone repository',
    "│  Failed to clone https://github.com/jimliu/baoyu-skills.git: Cloning into '/tmp/x'...",
    "│  fatal: unable to access 'https://github.com/jimliu/baoyu-skills.git/': Failed to connect to github.com port 443",
    '│  Tip: use the --yes (-y) and --global (-g) flags to install without prompts.',
    '└  Installation failed',
  ].join('\n');
  const summary = summarizeExternalPrepareOutput(raw, 1);
  assert.match(summary, /Failed to clone/);
  assert.match(summary, /github\.com port 443/);
  assert.doesNotMatch(summary, /Cloning repository/);
  assert.doesNotMatch(summary, /\u001B/);
});

test('CLI 日志会去掉 ANSI 和控制字符，并保留可读行', () => {
  const lines = splitCliLogLines('\u001B[33mCloning repository…\u001B[0m\rfatal: unable to access github.com\n█\n');
  assert.deepEqual(lines, ['Cloning repository…', 'fatal: unable to access github.com']);
});

test('按分类展开 skill，并拒绝未知分类', () => {
  const repo = createTmpRepo('skillctl-catalog-resolve-');
  try {
    repo.writeFile(`catalog/${SKILLS_FILE}`, JSON.stringify({
      version: 1,
      skills: [
        {
          id: 'alpha',
          package: 'skill-catalog',
          name: 'alpha',
          description: 'A',
          version: '1.0.0',
          source: 'skills/alpha',
          type: 'local',
          enabled: true,
        },
        {
          id: 'beta',
          package: 'skill-catalog',
          name: 'beta',
          description: 'B',
          version: '1.0.0',
          source: 'skills/beta',
          type: 'local',
          enabled: true,
        },
      ],
    }));
    repo.writeFile(`catalog/${CATEGORIES_FILE}`, JSON.stringify({
      version: 1,
      categories: [
        { id: 'common', name: '通用', description: '通用', skillIds: ['alpha'] },
        { id: 'dev', name: '开发', description: '开发', skillIds: ['beta'] },
      ],
    }));
    const catalog = loadSkillCatalog(join(repo.root, 'catalog'));
    assert.deepEqual(resolveCatalogSkills(catalog, { categoryIds: ['common'] }).map((skill) => skill.id), ['alpha']);
    assert.throws(() => resolveCatalogSkills(catalog, { categoryIds: ['missing'] }), /未知分类/);
    assert.throws(() => resolveCatalogSkills(catalog, {}), /请选择要安装的分类或 skill/);
  } finally {
    repo.cleanup();
  }
});

test('把所选分类安装到指定 Agent 的 skills 目录', async () => {
  const repo = createTmpRepo('skillctl-catalog-install-');
  try {
    repo.writeFile('catalog/skills/alpha/SKILL.md', '---\nname: alpha\ndescription: A\n---\n');
    repo.writeFile('catalog/skills/beta/SKILL.md', '---\nname: beta\ndescription: B\n---\n');
    repo.writeFile(`catalog/${SKILLS_FILE}`, JSON.stringify({
      version: 1,
      skills: [
        {
          id: 'alpha',
          package: 'skill-catalog',
          name: 'alpha',
          description: 'A',
          version: '1.0.0',
          source: 'skills/alpha',
          type: 'local',
          enabled: true,
        },
        {
          id: 'beta',
          package: 'skill-catalog',
          name: 'beta',
          description: 'B',
          version: '1.0.0',
          source: 'skills/beta',
          type: 'local',
          enabled: false,
        },
      ],
    }));
    repo.writeFile(`catalog/${CATEGORIES_FILE}`, JSON.stringify({
      version: 1,
      categories: [
        { id: 'common', name: '通用', description: '通用', skillIds: ['alpha', 'beta'] },
      ],
    }));

    const result = await installCatalogSkills({
      sourceDir: join(repo.root, 'catalog'),
      cacheDir: join(repo.root, 'cache'),
      scopeRoot: repo.root,
      targets: ['cursor'],
      selection: { categoryIds: ['common'] },
      mode: 'symlink',
      force: false,
      runExternalPrepare: async () => {
        throw new Error('不应准备外部 skill');
      },
    });

    assert.deepEqual(result.skippedDisabled, ['beta']);
    assert.equal(result.preparedCount, 1);
    assert.equal(result.items[0]?.status, 'create');
    assert.equal(lstatSync(join(repo.root, '.cursor/skills/alpha')).isSymbolicLink(), true);
    assert.equal(existsSync(join(repo.root, '.cursor/skills/beta')), false);
    assert.equal(existsSync(join(repo.root, '.cursor/skills', MANIFEST_FILE)), true);
  } finally {
    repo.cleanup();
  }
});
