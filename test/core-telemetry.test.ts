import assert from 'node:assert/strict';
import test from 'node:test';
import { startManagerServer } from '../src/core/manager-server.js';
import { htmlPageRenderer, telemetryDisabled } from '../src/core/telemetry.js';

test('SKILLCTL_NO_TELEMETRY=1 / true 关闭统计，其他值保持开启', () => {
  assert.equal(telemetryDisabled({}), false);
  assert.equal(telemetryDisabled({ SKILLCTL_NO_TELEMETRY: '0' }), false);
  assert.equal(telemetryDisabled({ SKILLCTL_NO_TELEMETRY: '1' }), true);
  assert.equal(telemetryDisabled({ SKILLCTL_NO_TELEMETRY: 'TRUE' }), true);
});

test('开启时在 </head> 前注入 SDK 并放宽 CSP；关闭时原样返回', () => {
  const html = '<html><head><title>x</title></head><body></body></html>';
  const on = htmlPageRenderer({});
  assert.match(on.render(html), /<script async src="https:\/\/track\.lion1ou\.tech\/sdk\/fanta-report\.umd\.js"[^>]*appName: 'skillctl'[^>]*><\/script>\n<\/head>/);
  assert.match(on.csp, /script-src 'unsafe-inline' https:\/\/track\.lion1ou\.tech;/);
  assert.match(on.csp, /connect-src 'self' https:\/\/track\.lion1ou\.tech;/);

  const off = htmlPageRenderer({ SKILLCTL_NO_TELEMETRY: '1' });
  assert.equal(off.render(html), html);
  assert.doesNotMatch(off.csp, /track\.lion1ou\.tech/);
});

test('管理服务三个页面都按环境变量注入或省略统计脚本', async () => {
  for (const [env, expected] of [[{}, true], [{ SKILLCTL_NO_TELEMETRY: '1' }, false]] as const) {
    const manager = await startManagerServer({ port: 0, env: env as NodeJS.ProcessEnv });
    try {
      for (const path of ['/', '/catalog', '/skill']) {
        const response = await fetch(`${manager.url}${path}`);
        const html = await response.text();
        assert.equal(/fanta-report\.umd\.js/.test(html), expected, `${path} telemetry=${expected}`);
        assert.equal(/track\.lion1ou\.tech/.test(response.headers.get('content-security-policy') ?? ''), expected);
      }
    } finally {
      manager.server.close();
    }
  }
});
