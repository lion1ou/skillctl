import assert from 'node:assert/strict';
import test from 'node:test';
import { CLI_NAME } from '../src/core/brand.js';
import { renderBanner } from '../src/ui/banner.js';

test('欢迎 banner 包含当前版本与 -v 提示', () => {
  const banner = renderBanner('1.2.0');
  assert.match(banner, new RegExp(`${CLI_NAME}`));
  assert.match(banner, /v1\.2\.0/);
  assert.match(banner, new RegExp(`${CLI_NAME} -v`));
});
