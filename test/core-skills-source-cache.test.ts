import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REMOTE_CACHE_TTL_MS,
  clearRemoteSkillsCache,
  fetchLeaderboardCached,
  getRemoteCacheEntry,
  searchSkillsCached,
} from '../src/core/skills-source-cache.js';

test('榜单缓存半小时内复用，强制刷新才重新请求', async () => {
  clearRemoteSkillsCache();
  let calls = 0;
  const request: typeof fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      skills: [{ source: 'owner/repo', skillId: 'fresh', name: 'fresh', installs: 1 }],
      hasMore: false,
    }));
  };

  const first = await fetchLeaderboardCached('hot', 0, { request, now: 1_000 });
  const second = await fetchLeaderboardCached('hot', 0, { request, now: 1_000 + REMOTE_CACHE_TTL_MS - 1 });
  assert.equal(calls, 1);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(second.skills[0]?.name, 'fresh');

  const forced = await fetchLeaderboardCached('hot', 0, {
    request,
    now: 1_000 + REMOTE_CACHE_TTL_MS - 1,
    force: true,
  });
  assert.equal(calls, 2);
  assert.equal(forced.cached, false);

  // 强制刷新会重置 cachedAt，过期判断以该次写入时间为准
  const expired = await fetchLeaderboardCached('hot', 0, {
    request,
    now: forced.cachedAt + REMOTE_CACHE_TTL_MS + 1,
  });
  assert.equal(calls, 3);
  assert.equal(expired.cached, false);
});

test('搜索缓存按 query/limit 分隔，可用前缀清理', async () => {
  clearRemoteSkillsCache();
  let calls = 0;
  const request: typeof fetch = async (input) => {
    calls += 1;
    const url = String(input);
    return new Response(JSON.stringify({
      skills: [{
        id: 'owner/repo/a',
        name: 'a',
        source: 'owner/repo',
        installs: url.includes('limit=5') ? 5 : 30,
      }],
    }));
  };

  await searchSkillsCached('go', 30, { request, now: 10 });
  await searchSkillsCached('go', 30, { request, now: 20 });
  await searchSkillsCached('go', 5, { request, now: 20 });
  assert.equal(calls, 2);

  clearRemoteSkillsCache('search:go:');
  assert.equal(getRemoteCacheEntry('search:go:30'), null);
  await searchSkillsCached('go', 30, { request, now: 30 });
  assert.equal(calls, 3);
});
