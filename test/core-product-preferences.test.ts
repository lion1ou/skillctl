import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_PRODUCT_PREFERENCES,
  loadProductPreferences,
  shouldRequestChineseDescription,
} from '../src/core/product-preferences.js';
import { createTmpRepo } from './helpers/tmp-repo.js';

const EXAMPLE = fileURLToPath(new URL('../skillctl.config.example.json', import.meta.url));

test('没有偏好文件时使用模板默认值', () => {
  const repo = createTmpRepo('skillctl-prefs-default-');
  try {
    const env = {
      HOME: repo.root,
      XDG_CONFIG_HOME: join(repo.root, 'config'),
    } as NodeJS.ProcessEnv;
    assert.deepEqual(loadProductPreferences(env), DEFAULT_PRODUCT_PREFERENCES);
    assert.deepEqual(JSON.parse(readFileSync(EXAMPLE, 'utf8')), DEFAULT_PRODUCT_PREFERENCES);
  } finally {
    repo.cleanup();
  }
});

test('本机偏好只覆盖写出的字段', () => {
  const repo = createTmpRepo('skillctl-prefs-merge-');
  try {
    const env = {
      HOME: repo.root,
      XDG_CONFIG_HOME: join(repo.root, 'config'),
      SKILLCTL_PREFERENCES: join(repo.root, 'preferences.json'),
    } as NodeJS.ProcessEnv;
    writeFileSync(env.SKILLCTL_PREFERENCES, `${JSON.stringify({
      gitProtocol: 'ssh',
      requireChineseDescription: true,
    })}\n`);
    assert.deepEqual(loadProductPreferences(env), {
      gitProtocol: 'ssh',
      requireChineseDescription: true,
      npmRegistry: 'https://registry.npmjs.org/',
    });
    assert.equal(shouldRequestChineseDescription('Remove AI tone', loadProductPreferences(env)), true);
    assert.equal(shouldRequestChineseDescription('去除 AI 痕迹', loadProductPreferences(env)), false);
    assert.equal(shouldRequestChineseDescription('Remove AI tone', DEFAULT_PRODUCT_PREFERENCES), false);
  } finally {
    repo.cleanup();
  }
});

test('偏好文件字段非法时拒绝，而不是退回默认值', () => {
  const repo = createTmpRepo('skillctl-prefs-invalid-');
  try {
    const file = join(repo.root, 'preferences.json');
    writeFileSync(file, '{"gitProtocol":"ftp"}\n');
    assert.throws(
      () => loadProductPreferences({ SKILLCTL_PREFERENCES: file } as NodeJS.ProcessEnv),
      /gitProtocol/,
    );
  } finally {
    repo.cleanup();
  }
});
