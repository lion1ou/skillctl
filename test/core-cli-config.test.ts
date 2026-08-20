import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { CATEGORIES_FILE, SKILLS_FILE } from '../src/core/brand.js';
import { loadSkillCatalog } from '../src/core/skill-registry.js';
import {
  initializeCliConfig,
  loadCliConfig,
  peekCliConfig,
  resolveCliConfigPath,
  resolveRequiredAbsolutePath,
  resolveSkillCacheDir,
} from '../src/core/cli-config.js';
import { createTmpRepo } from './helpers/tmp-repo.js';

test('配置固定写入 XDG_CONFIG_HOME/skillctl/config.json', () => {
  const repo = createTmpRepo('skillctl-config-');
  try {
    const file = resolveCliConfigPath({
      XDG_CONFIG_HOME: join(repo.root, 'config'),
    } as NodeJS.ProcessEnv);
    assert.equal(file, join(repo.root, 'config/skillctl/config.json'));
  } finally {
    repo.cleanup();
  }
});

test('初始化保存绝对 sourceDir 和 cacheDir，不覆盖已有配置表', () => {
  const repo = createTmpRepo('skillctl-init-');
  try {
    repo.writeFile(`catalog/${SKILLS_FILE}`, '{"version":1,"skills":[{"id":"keep"}]}');
    repo.writeFile(`catalog/${CATEGORIES_FILE}`, '{"version":1,"categories":[]}');
    repo.mkdir('catalog/skills');
    const env = { XDG_CONFIG_HOME: join(repo.root, 'config') } as NodeJS.ProcessEnv;
    const cacheDir = join(repo.root, 'cache');

    initializeCliConfig({
      sourceDir: join(repo.root, 'catalog'),
      cacheDir,
      env,
    });

    assert.deepEqual(loadCliConfig(env), {
      version: 1,
      sourceDir: join(repo.root, 'catalog'),
      cacheDir,
    });
    assert.equal(
      readFileSync(join(repo.root, `catalog/${SKILLS_FILE}`), 'utf8').trim(),
      '{"version":1,"skills":[{"id":"keep"}]}',
    );
  } finally {
    repo.cleanup();
  }
});

test('源目录缺少配置表时生成带远程示例的 skillctl 前缀文件', () => {
  const repo = createTmpRepo('skillctl-init-empty-');
  try {
    const sourceDir = join(repo.root, 'catalog');
    const env = { XDG_CONFIG_HOME: join(repo.root, 'config') } as NodeJS.ProcessEnv;
    initializeCliConfig({ sourceDir, cacheDir: join(repo.root, 'cache'), env });
    const catalog = loadSkillCatalog(sourceDir);
    assert.deepEqual(catalog.skills.map((skill) => skill.name), ['find-skills', 'humanizer-zh']);
    assert.equal(catalog.skills.every((skill) => skill.type === 'external'), true);
    assert.deepEqual(catalog.categories[0]?.skillIds, ['find-skills', 'humanizer-zh']);
    assert.equal(existsSync(join(sourceDir, 'skills')), true);
  } finally {
    repo.cleanup();
  }
});

test('peekCliConfig 在配置不存在时返回 null，存在时返回已保存路径', () => {
  const repo = createTmpRepo('skillctl-peek-');
  try {
    const env = { XDG_CONFIG_HOME: join(repo.root, 'config') } as NodeJS.ProcessEnv;
    assert.equal(peekCliConfig(env), null);
    const cacheDir = join(repo.root, 'cache');
    initializeCliConfig({
      sourceDir: join(repo.root, 'catalog'),
      cacheDir,
      env,
    });
    assert.deepEqual(peekCliConfig(env), {
      version: 1,
      sourceDir: join(repo.root, 'catalog'),
      cacheDir,
    });
  } finally {
    repo.cleanup();
  }
});

test('非交互重复初始化且未 force 时仍拒绝覆盖', () => {
  const repo = createTmpRepo('skillctl-init-exists-');
  try {
    const env = { XDG_CONFIG_HOME: join(repo.root, 'config') } as NodeJS.ProcessEnv;
    const sourceDir = join(repo.root, 'catalog');
    initializeCliConfig({ sourceDir, env });
    assert.throws(
      () => initializeCliConfig({ sourceDir, env }),
      /配置已存在/,
    );
  } finally {
    repo.cleanup();
  }
});

test('相对路径会被拒绝', () => {
  assert.throws(() => resolveRequiredAbsolutePath('catalog', '源目录'), /绝对路径/);
});

test('未初始化时给出明确 init 指引', () => {
  const repo = createTmpRepo('skillctl-missing-config-');
  try {
    assert.throws(
      () => loadCliConfig({ XDG_CONFIG_HOME: repo.root } as NodeJS.ProcessEnv),
      /skillctl init --source/,
    );
  } finally {
    repo.cleanup();
  }
});

test('未指定 cacheDir 时使用脚本目录 .cache', () => {
  const repo = createTmpRepo('skillctl-default-cache-');
  try {
    const env = { XDG_CONFIG_HOME: join(repo.root, 'config') } as NodeJS.ProcessEnv;
    const config = initializeCliConfig({
      sourceDir: join(repo.root, 'catalog'),
      env,
    });
    assert.equal(config.cacheDir, resolveSkillCacheDir());
  } finally {
    repo.cleanup();
  }
});

test('外部 skill 默认缓存在 CLI 脚本目录 .cache', () => {
  assert.equal(
    resolveSkillCacheDir(),
    join(fileURLToPath(new URL('..', import.meta.url)), '.cache'),
  );
});
