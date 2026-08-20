import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCatalogOptions,
  toggleCatalogSelection,
} from '../src/prompts/catalog-multiselect.js';
import type { SkillCatalog } from '../src/core/skill-registry.js';

function sampleCatalog(): SkillCatalog {
  return {
    skills: [
      {
        id: 'find-skills',
        package: 'vercel-labs/skills',
        name: 'find-skills',
        description: '搜索 skill',
        version: '*',
        source: 'https://github.com/vercel-labs/skills',
        type: 'external',
      },
      {
        id: 'humanizer-zh',
        package: 'op7418/humanizer-zh',
        name: 'humanizer-zh',
        description: '去 AI 痕迹',
        version: '*',
        source: 'https://github.com/op7418/humanizer-zh',
        type: 'external',
      },
      {
        id: 'local-skill',
        package: 'skill-catalog',
        name: 'local-skill',
        description: '本地能力',
        version: '1.0.0',
        source: 'skills/local-skill',
        type: 'local',
      },
    ],
    categories: [
      {
        id: 'common',
        name: '通用',
        description: '通用能力',
        skillIds: ['find-skills', 'humanizer-zh'],
      },
      {
        id: 'self',
        name: '自建',
        description: '自建能力',
        skillIds: ['local-skill'],
      },
    ],
  };
}

test('分类行在前，子 skill 以 depth 1 缩进排在分类下', () => {
  const options = buildCatalogOptions(sampleCatalog());
  assert.deepEqual(options.map((item) => [item.value, item.depth, item.isGroup]), [
    ['common', 0, true],
    ['find-skills', 1, false],
    ['humanizer-zh', 1, false],
    ['self', 0, true],
    ['local-skill', 1, false],
  ]);
});

test('选中分类即选中该分类下全部 skill', () => {
  const options = buildCatalogOptions(sampleCatalog());
  const selected = toggleCatalogSelection(options, [], 0);
  assert.deepEqual(selected, ['find-skills', 'humanizer-zh']);
});

test('再次选中分类会取消该分类下全部 skill', () => {
  const options = buildCatalogOptions(sampleCatalog());
  const selected = toggleCatalogSelection(
    options,
    toggleCatalogSelection(options, [], 0),
    0,
  );
  assert.deepEqual(selected, []);
});

test('单独切换子 skill 不影响同分类其他项', () => {
  const options = buildCatalogOptions(sampleCatalog());
  const selected = toggleCatalogSelection(options, ['find-skills', 'humanizer-zh'], 1);
  assert.deepEqual(selected, ['humanizer-zh']);
});
