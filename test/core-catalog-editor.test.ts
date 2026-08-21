import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { CATEGORIES_FILE, SKILLS_FILE } from '../src/core/brand.js';
import {
  createCatalogCategory,
  loadCatalogWorkspace,
  patchCatalogCategory,
  patchCatalogSkill,
  removeCatalogCategory,
  removeCatalogSkill,
  syncUnregisteredSkills,
} from '../src/core/catalog-editor.js';
import { createTmpRepo } from './helpers/tmp-repo.js';

function writeCatalog(repo: ReturnType<typeof createTmpRepo>): string {
  const sourceDir = join(repo.root, 'catalog');
  repo.writeFile(`catalog/${SKILLS_FILE}`, JSON.stringify({
    version: 1,
    skills: [{
      id: 'keep-skill',
      package: 'skill-catalog',
      name: 'keep-skill',
      description: '保留项',
      version: '1.0.0',
      source: 'skills/keep-skill',
      type: 'local',
      enabled: true,
    }],
  }));
  repo.writeFile(`catalog/${CATEGORIES_FILE}`, JSON.stringify({
    version: 1,
    categories: [{
      id: 'common',
      name: '通用',
      description: '通用能力',
      skillIds: ['keep-skill'],
    }],
  }));
  repo.writeFile('catalog/skills/keep-skill/SKILL.md', '---\nname: keep-skill\ndescription: 保留项\n---\n');
  return sourceDir;
}

test('配置页能列出未登记本地 skill 和未分类项', () => {
  const repo = createTmpRepo('skillctl-catalog-load-');
  try {
    const sourceDir = writeCatalog(repo);
    repo.writeFile('catalog/skills/new-skill/SKILL.md', '---\nname: new-skill\ndescription: 新增能力\n---\n');
    const workspace = loadCatalogWorkspace(sourceDir);
    assert.deepEqual(workspace.unregistered.map((skill) => skill.name), ['new-skill']);
    assert.deepEqual(workspace.uncategorized.map((skill) => skill.id), []);
  } finally {
    repo.cleanup();
  }
});

test('可更新启用状态、描述并改分类', () => {
  const repo = createTmpRepo('skillctl-catalog-patch-');
  try {
    const sourceDir = writeCatalog(repo);
    createCatalogCategory(sourceDir, { id: 'dev', name: '开发', description: '开发能力' });
    const workspace = patchCatalogSkill(sourceDir, 'keep-skill', {
      description: '更新后的描述',
      enabled: false,
      categoryId: 'dev',
    });
    const skill = workspace.catalog.skills[0];
    assert.equal(skill?.description, '更新后的描述');
    assert.equal(skill?.enabled, false);
    assert.deepEqual(workspace.catalog.categories[0]?.skillIds, []);
    assert.deepEqual(workspace.catalog.categories[1]?.skillIds, ['keep-skill']);
  } finally {
    repo.cleanup();
  }
});

test('同步未登记本地 skill 到指定分类', () => {
  const repo = createTmpRepo('skillctl-catalog-sync-');
  try {
    const sourceDir = writeCatalog(repo);
    repo.writeFile('catalog/skills/new-skill/SKILL.md', '---\nname: new-skill\ndescription: 新增能力\n---\n');
    const workspace = syncUnregisteredSkills(sourceDir, 'common', ['new-skill']);
    assert.equal(workspace.unregistered.length, 0);
    assert.deepEqual(workspace.catalog.categories[0]?.skillIds, ['keep-skill', 'new-skill']);
  } finally {
    repo.cleanup();
  }
});

test('空分类可删除，有 skill 时拒绝删除', () => {
  const repo = createTmpRepo('skillctl-catalog-category-');
  try {
    const sourceDir = writeCatalog(repo);
    createCatalogCategory(sourceDir, { id: 'empty', name: '空分类', description: '待删除' });
    assert.throws(() => removeCatalogCategory(sourceDir, 'common'), /请先移出/);
    const workspace = removeCatalogCategory(sourceDir, 'empty');
    assert.deepEqual(workspace.catalog.categories.map((category) => category.id), ['common']);
    patchCatalogCategory(sourceDir, 'common', { name: '通用能力', description: '已更新' });
    assert.equal(loadCatalogWorkspace(sourceDir).catalog.categories[0]?.name, '通用能力');
  } finally {
    repo.cleanup();
  }
});

test('从配置表移除 skill 不删除源文件', () => {
  const repo = createTmpRepo('skillctl-catalog-remove-');
  try {
    const sourceDir = writeCatalog(repo);
    const workspace = removeCatalogSkill(sourceDir, 'keep-skill');
    assert.equal(workspace.catalog.skills.length, 0);
    assert.deepEqual(workspace.unregistered.map((skill) => skill.name), ['keep-skill']);
  } finally {
    repo.cleanup();
  }
});
