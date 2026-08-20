import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  addSkillsToRegistry,
  findUnregisteredLocalSkills,
  loadSkillCatalog,
  reconcileSkillCatalog,
  prepareSkillSources,
} from '../src/core/skill-registry.js';
import { CATEGORIES_FILE, SKILLS_FILE } from '../src/core/brand.js';
import { createTmpRepo } from './helpers/tmp-repo.js';

test('发现本地目录中未登记的 skill', () => {
  const repo = createTmpRepo('skillctl-registry-');
  try {
    repo.writeFile('catalog/skills/new-skill/SKILL.md', [
      '---',
      'name: new-skill',
      'description: 新增能力',
      'version: 1.2.0',
      '---',
    ].join('\n'));
    repo.writeFile(`catalog/${SKILLS_FILE}`, JSON.stringify({ version: 1, skills: [] }));
    repo.writeFile(`catalog/${CATEGORIES_FILE}`, JSON.stringify({
      version: 1,
      categories: [{ id: 'common', name: '通用', description: '通用能力', skillIds: [] }],
    }));

    const catalog = loadSkillCatalog(join(repo.root, 'catalog'));
    const missing = findUnregisteredLocalSkills(join(repo.root, 'catalog'), catalog);

    assert.deepEqual(missing.map((skill) => skill.name), ['new-skill']);
    assert.equal(missing[0]?.description, '新增能力');
    assert.equal(missing[0]?.version, '1.2.0');
  } finally {
    repo.cleanup();
  }
});

test('登记 skill 时同步更新注册表和分类表', () => {
  const repo = createTmpRepo('skillctl-add-');
  try {
    repo.writeFile('catalog/skills/new-skill/SKILL.md', '---\nname: new-skill\ndescription: 新增能力\n---\n');
    repo.writeFile(`catalog/${SKILLS_FILE}`, JSON.stringify({ version: 1, skills: [] }));
    repo.writeFile(`catalog/${CATEGORIES_FILE}`, JSON.stringify({
      version: 1,
      categories: [{ id: 'common', name: '通用', description: '通用能力', skillIds: [] }],
    }));

    const catalog = loadSkillCatalog(join(repo.root, 'catalog'));
    const localSkill = findUnregisteredLocalSkills(join(repo.root, 'catalog'), catalog)[0];
    assert.ok(localSkill);
    addSkillsToRegistry(join(repo.root, 'catalog'), catalog, 'common', [localSkill]);

    const updated = loadSkillCatalog(join(repo.root, 'catalog'));
    assert.equal(updated.skills[0]?.type, 'local');
    assert.deepEqual(updated.categories[0]?.skillIds, ['new-skill']);
  } finally {
    repo.cleanup();
  }
});

test('准备阶段把外部 skill 暂存为统一的本地 sourceDir', async () => {
  const repo = createTmpRepo('skillctl-prepare-');
  try {
    repo.writeFile('catalog/skills/local-skill/SKILL.md', '# local');
    const skills = [
      {
        id: 'local-skill',
        package: 'skill-catalog',
        name: 'local-skill',
        description: '本地能力',
        version: '1.0.0',
        source: 'skills/local-skill',
        type: 'local' as const,
      },
      {
        id: 'remote-skill',
        package: 'owner/repo',
        name: 'remote-skill',
        description: '外部能力',
        version: '*',
        source: 'https://github.com/owner/repo',
        type: 'external' as const,
      },
    ];

    const prepared = await prepareSkillSources(
      join(repo.root, 'catalog'),
      join(repo.root, '.cache'),
      skills,
      ({ cachePackageDir, skillNames }) => {
        repo.writeFile(
          `${cachePackageDir.slice(repo.root.length + 1)}/.agents/skills/${skillNames[0]}/SKILL.md`,
          '# remote',
        );
        repo.writeFile(
          `${cachePackageDir.slice(repo.root.length + 1)}/skills-lock.json`,
          '{}',
        );
      },
    );

    assert.equal(prepared[0]?.sourceDir, join(repo.root, 'catalog/skills/local-skill'));
    assert.equal(
      prepared[1]?.sourceDir,
      join(repo.root, '.cache/owner/repo/remote-skill'),
    );
    assert.equal(existsSync(prepared[1]?.sourceDir ?? ''), true);
    assert.equal(existsSync(join(repo.root, '.cache/owner/repo/.agents')), false);
    assert.equal(existsSync(join(repo.root, '.cache/owner/repo/skills-lock.json')), false);
  } finally {
    repo.cleanup();
  }
});

test('注册表已删除的 skill 会从分类中移除且不报错', () => {
  const repo = createTmpRepo('skillctl-orphan-');
  try {
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
      }],
    }));
    repo.writeFile(`catalog/${CATEGORIES_FILE}`, JSON.stringify({
      version: 1,
      categories: [{
        id: 'common',
        name: '通用',
        description: '通用能力',
        skillIds: ['keep-skill', 'deleted-skill'],
      }],
    }));

    const result = reconcileSkillCatalog(join(repo.root, 'catalog'));
    const saved = loadSkillCatalog(join(repo.root, 'catalog'));

    assert.deepEqual(result.removedOrphanIds, ['deleted-skill']);
    assert.deepEqual(result.catalog.categories[0]?.skillIds, ['keep-skill']);
    assert.deepEqual(saved.categories[0]?.skillIds, ['keep-skill']);
  } finally {
    repo.cleanup();
  }
});
