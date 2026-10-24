import assert from 'node:assert/strict';
import test from 'node:test';
import { CLI_NAME } from '../src/core/brand.js';
import { renderBanner } from '../src/ui/banner.js';

test('欢迎 banner 包含当前版本与 -v 提示', () => {
  const banner = renderBanner('1.2.3');
  assert.match(banner, new RegExp(`${CLI_NAME}`));
  assert.match(banner, /v1\.2\.3/);
  assert.match(banner, new RegExp(`${CLI_NAME} -v`));
});

test('管理页导航展示 package.json 版本号', async () => {
  const { renderManagerNav } = await import('../src/ui/manager-chrome.js');
  const { VERSION } = await import('../src/core/package-meta.js');
  assert.match(renderManagerNav('installed'), new RegExp(`brand-version">v${VERSION.replace(/\./g, '\\.')}<`));
});
