import {
  fetchLeaderboard,
  searchSkills,
  type LeaderboardPage,
  type LeaderboardView,
  type SkillsSearchResult,
} from './skills-source.js';

/** skills.sh 远程列表本地缓存时长：30 分钟。 */
export const REMOTE_CACHE_TTL_MS = 30 * 60 * 1000;

interface CacheEntry<T> {
  value: T;
  cachedAt: number;
  expiresAt: number;
}

export interface CachedLeaderboardPage extends LeaderboardPage {
  cached: boolean;
  cachedAt: number;
}

export interface CachedSearchResult {
  skills: SkillsSearchResult[];
  cached: boolean;
  cachedAt: number;
}

const remoteCache = new Map<string, CacheEntry<unknown>>();

/** 读取缓存项；仅测试与调试使用。 */
export function getRemoteCacheEntry(key: string): CacheEntry<unknown> | null {
  return remoteCache.get(key) ?? null;
}

/** 清空全部或指定前缀的远程缓存。 */
export function clearRemoteSkillsCache(prefix?: string): void {
  if (!prefix) {
    remoteCache.clear();
    return;
  }
  for (const key of [...remoteCache.keys()]) {
    if (key.startsWith(prefix)) remoteCache.delete(key);
  }
}

function readCache<T>(key: string, now: number): CacheEntry<T> | null {
  const entry = remoteCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    remoteCache.delete(key);
    return null;
  }
  return entry;
}

function writeCache<T>(key: string, value: T, now: number): CacheEntry<T> {
  const entry: CacheEntry<T> = {
    value,
    cachedAt: now,
    expiresAt: now + REMOTE_CACHE_TTL_MS,
  };
  remoteCache.set(key, entry);
  return entry;
}

function leaderboardKey(view: LeaderboardView, page: number): string {
  return `leaderboard:${view}:${page}`;
}

function searchKey(query: string, limit: number): string {
  return `search:${query.trim().toLowerCase()}:${limit}`;
}

/** 带半小时缓存的榜单读取；force 时使该 view 全部页失效并重新拉取。 */
export async function fetchLeaderboardCached(
  view: LeaderboardView,
  page: number,
  options: {
    request?: typeof fetch;
    force?: boolean;
    now?: number;
  } = {},
): Promise<CachedLeaderboardPage> {
  const now = options.now ?? Date.now();
  const key = leaderboardKey(view, page);
  if (options.force) clearRemoteSkillsCache(`leaderboard:${view}:`);
  else {
    const hit = readCache<LeaderboardPage>(key, now);
    if (hit) {
      return { ...hit.value, cached: true, cachedAt: hit.cachedAt };
    }
  }
  const value = await fetchLeaderboard(view, page, options.request ?? fetch);
  const saved = writeCache(key, value, now);
  return { ...value, cached: false, cachedAt: saved.cachedAt };
}

/** 带半小时缓存的搜索；force 时使该 query 相关缓存失效并重新拉取。 */
export async function searchSkillsCached(
  query: string,
  limit = 10,
  options: {
    request?: typeof fetch;
    force?: boolean;
    now?: number;
  } = {},
): Promise<CachedSearchResult> {
  const now = options.now ?? Date.now();
  const normalized = query.trim().toLowerCase();
  const key = searchKey(normalized, limit);
  if (options.force) clearRemoteSkillsCache(`search:${normalized}:`);
  else {
    const hit = readCache<SkillsSearchResult[]>(key, now);
    if (hit) {
      return { skills: hit.value, cached: true, cachedAt: hit.cachedAt };
    }
  }
  const skills = await searchSkills(query, options.request ?? fetch, limit);
  const saved = writeCache(key, skills, now);
  return { skills, cached: false, cachedAt: saved.cachedAt };
}
