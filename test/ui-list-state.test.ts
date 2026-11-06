import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { CATALOG_PAGE } from '../src/ui/catalog-page.js';
import { MANAGER_PAGE } from '../src/ui/manager-page.js';
import {
  catalogListStateKey,
  installedListStateKey,
  parseCatalogListState,
  parseInstalledListState,
} from '../src/ui/list-state.js';

function embeddedFunction(page: string, name: string): (raw: unknown) => unknown {
  const match = page.match(new RegExp(`const ${name}=(function[\\s\\S]*?);\\nconst `));
  assert.ok(match, `${name} 没有嵌入页面`);
  return runInNewContext(`(${match[1]})`) as (raw: unknown) => unknown;
}

test('安装管理页可以恢复 Agent、筛选和勾选', () => {
  const raw = JSON.stringify({
    workspace: '/work',
    agent: 'cursor',
    keyword: 'hook',
    status: 'on',
    installMode: 'symlink',
    selectedSkillIds: ['cursor:review', ''],
    scrollTop: 120,
  });
  assert.equal(installedListStateKey(), 'skillctl:list-state:installed');
  assert.deepEqual(parseInstalledListState(raw), {
    workspace: '/work',
    agent: 'cursor',
    keyword: 'hook',
    status: 'on',
    installMode: 'symlink',
    selectedSkillIds: ['cursor:review'],
    scrollTop: 120,
  });
  assert.equal(parseInstalledListState(''), null);
  assert.throws(() => parseInstalledListState('{'), /无法解析列表选中状态/);
  const embedded = embeddedFunction(MANAGER_PAGE, 'parseInstalledListState');
  assert.equal((embedded(raw) as { agent: string }).agent, 'cursor');
});

test('Skill 源页可以恢复分类和勾选', () => {
  assert.equal(catalogListStateKey(), 'skillctl:list-state:catalog');
  assert.deepEqual(parseCatalogListState({
    category: 'write',
    keyword: 'doc',
    enabled: 'on',
    type: 'local',
    scope: '',
    selectedSkillIds: ['doc'],
    scrollTop: 0,
  }), {
    category: 'write',
    keyword: 'doc',
    enabled: 'on',
    type: 'local',
    scope: '',
    selectedSkillIds: ['doc'],
    scrollTop: 0,
  });
  assert.equal(parseCatalogListState({}), null);
  const embedded = embeddedFunction(CATALOG_PAGE, 'parseCatalogListState');
  assert.equal((embedded('{"category":"write","selectedSkillIds":["doc"]}') as { category: string }).category, 'write');
});
