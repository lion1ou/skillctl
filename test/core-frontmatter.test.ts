import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeSkillDescription,
  parseFrontmatter,
} from '../src/core/frontmatter.js';

test('解析单行、引号和 YAML 多行 description', () => {
  assert.equal(parseFrontmatter([
    '---',
    'name: plain',
    'description: 单行描述',
    '---',
  ].join('\n')).description, '单行描述');

  assert.equal(parseFrontmatter([
    '---',
    'name: quoted',
    'description: "把复杂主题拆为子问题，输出研究报告。"',
    '---',
  ].join('\n')).description, '把复杂主题拆为子问题，输出研究报告。');

  const block = parseFrontmatter([
    '---',
    'name: humanizer-zh',
    'description: |',
    '  去除文本中的 AI 生成痕迹。适用于编辑或审阅文本，使其听起来更自然。',
    '  基于维基百科的 AI 写作特征指南。',
    'allowed-tools:',
    '  - Read',
    '---',
    '',
    '# body',
  ].join('\n'));
  assert.equal(block.name, 'humanizer-zh');
  assert.match(block.description ?? '', /去除文本中的 AI 生成痕迹/);
  assert.match(block.description ?? '', /基于维基百科/);
  assert.notEqual(block.description, '|');
});

test('折叠块标量和空 metadata 嵌套不会污染标量字段', () => {
  const metadata = parseFrontmatter([
    '---',
    'name: folded',
    'description: >',
    '  第一行内容',
    '  第二行内容',
    'metadata:',
    '  openclaw:',
    '    homepage: https://example.com',
    '---',
  ].join('\n'));
  assert.equal(metadata.description, '第一行内容 第二行内容');
  assert.equal(metadata.metadata, undefined);
});

test('normalizeSkillDescription 压缩空白', () => {
  assert.equal(normalizeSkillDescription('一行\n两行'), '一行 两行');
  assert.equal(normalizeSkillDescription('  a   b  '), 'a b');
  assert.equal(normalizeSkillDescription('   '), '无描述');
});
