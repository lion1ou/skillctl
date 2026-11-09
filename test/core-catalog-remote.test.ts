import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { CATEGORIES_FILE, SKILLS_FILE } from '../src/core/brand.js';
import {
  ensureSkillsEnabled,
  registerRemoteSkills,
} from '../src/core/catalog-remote.js';
import { loadSkillCatalog } from '../src/core/skill-registry.js';
import { createTmpRepo } from './helpers/tmp-repo.js';

function writeEmptyCatalog(repo: ReturnType<typeof createTmpRepo>): string {
  const sourceDir = join(repo.root, 'catalog');
  repo.mkdir('catalog/skills');
  repo.writeFile(`catalog/${SKILLS_FILE}`, JSON.stringify({ version: 1, skills: [] }));
  repo.writeFile(`catalog/${CATEGORIES_FILE}`, JSON.stringify({
    version: 1,
    categories: [{ id: 'common', name: '通用', description: '通用', skillIds: [] }],
  }));
  return sourceDir;
}

test('登记远程 skill：跳过已存在、拒绝非 GitHub、探包成功写入', () => {
  const repo = createTmpRepo('skillctl-remote-');
  try {
    const sourceDir = writeEmptyCatalog(repo);
    repo.writeFile(`catalog/${SKILLS_FILE}`, JSON.stringify({
      version: 1,
      skills: [{
        id: 'exists',
        package: 'owner/repo',
        name: 'exists',
        description: '已有',
        version: '*',
        source: 'https://github.com/owner/repo',
        type: 'external',
        enabled: true,
      }],
    }));
    repo.writeFile(`catalog/${CATEGORIES_FILE}`, JSON.stringify({
      version: 1,
      categories: [{ id: 'common', name: '通用', description: '通用', skillIds: ['exists'] }],
    }));

    const result = registerRemoteSkills(sourceDir, {
      categoryId: 'common',
      skills: [
        { package: 'owner/repo', name: 'exists' },
        { package: 'uizze.sh', name: 'ui-taste' },
        { package: 'owner/new', name: 'fresh' },
        { package: 'owner/new', name: 'missing-in-pkg' },
      ],
    }, {
      inspectPackageSkills: (packageId) => {
        if (packageId === 'owner/new') {
          return [{ name: 'fresh', description: '新能力介绍' }];
        }
        return [];
      },
    });

    assert.deepEqual(result.skipped, ['exists']);
    assert.equal(result.failed.length, 2);
    assert.match(result.failed[0]?.reason ?? '', /GitHub|github|owner\/repo/i);
    assert.deepEqual(result.added, ['fresh']);

    const catalog = loadSkillCatalog(sourceDir);
    const fresh = catalog.skills.find((skill) => skill.name === 'fresh');
    assert.ok(fresh);
    assert.equal(fresh.type, 'external');
    assert.equal(fresh.package, 'owner/new');
    assert.equal(fresh.description, '新能力介绍');
    assert.equal(fresh.source, 'https://github.com/owner/new');
    assert.ok(catalog.categories[0]?.skillIds.includes('fresh'));
  } finally {
    repo.cleanup();
  }
});

test('ensureSkillsEnabled 将选中项写为启用', () => {
  const repo = createTmpRepo('skillctl-enable-');
  try {
    const sourceDir = writeEmptyCatalog(repo);
    repo.writeFile(`catalog/${SKILLS_FILE}`, JSON.stringify({
      version: 1,
      skills: [{
        id: 'off',
        package: 'owner/repo',
        name: 'off',
        description: '关闭',
        version: '*',
        source: 'https://github.com/owner/repo',
        type: 'external',
        enabled: false,
      }],
    }));
    repo.writeFile(`catalog/${CATEGORIES_FILE}`, JSON.stringify({
      version: 1,
      categories: [{ id: 'common', name: '通用', description: '通用', skillIds: ['off'] }],
    }));

    ensureSkillsEnabled(sourceDir, ['off']);
    assert.equal(loadSkillCatalog(sourceDir).skills[0]?.enabled, true);
  } finally {
    repo.cleanup();
  }
});
