import { spawnSync } from 'node:child_process';

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, 'g');
const LEADERBOARD_VIEWS = new Set(['all-time', 'trending', 'hot'] as const);
const GITHUB_PACKAGE_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export type LeaderboardView = 'all-time' | 'trending' | 'hot';

export interface SkillsSearchResult {
  name: string;
  slug: string;
  package: string;
  installs: number;
  description?: string;
  isOfficial?: boolean;
}

export interface PackageSkill {
  name: string;
  description: string;
}

export interface LeaderboardSkill {
  name: string;
  package: string;
  installs: number;
  description?: string;
  isOfficial?: boolean;
  weeklyInstalls?: number[];
  installsYesterday?: number;
  change?: number;
}

export interface LeaderboardPage {
  skills: LeaderboardSkill[];
  hasMore: boolean;
}

/** 判断 source 是否为可走 npx skills 的 GitHub owner/repo。 */
export function isGithubPackageSource(source: string): boolean {
  return GITHUB_PACKAGE_PATTERN.test(source.trim());
}

/** 通过 skills.sh 搜索接口查询可登记的外部 skill。 */
export async function searchSkills(
  query: string,
  request: typeof fetch = fetch,
  limit = 10,
): Promise<SkillsSearchResult[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const response = await request(`https://skills.sh/api/search?${params.toString()}`);
  if (!response.ok) throw new Error(`skills.sh 搜索失败：HTTP ${response.status}`);
  const document = await response.json() as {
    skills?: Array<{
      id?: string;
      name?: string;
      installs?: number;
      source?: string;
      description?: string;
      isOfficial?: boolean;
    }>;
  };
  return (document.skills ?? [])
    .filter((item) => item.id && item.name && item.source)
    .map((item) => ({
      name: item.name as string,
      slug: item.id as string,
      package: item.source as string,
      installs: item.installs ?? 0,
      ...(typeof item.description === 'string' && item.description.trim()
        ? { description: item.description.trim() }
        : {}),
      ...(item.isOfficial === true ? { isOfficial: true } : {}),
    }))
    .sort((left, right) => right.installs - left.installs);
}

/** 拉取 skills.sh 首页同款榜单分页（免鉴权）。 */
export async function fetchLeaderboard(
  view: LeaderboardView,
  page: number,
  request: typeof fetch = fetch,
): Promise<LeaderboardPage> {
  if (!LEADERBOARD_VIEWS.has(view)) {
    throw new Error(`无效的榜单 view：${view}`);
  }
  if (!Number.isInteger(page) || page < 0) {
    throw new Error(`无效的榜单 page：${page}`);
  }
  const response = await request(`https://skills.sh/api/skills/${view}/${page}`);
  if (!response.ok) throw new Error(`skills.sh 榜单失败：HTTP ${response.status}`);
  const document = await response.json() as {
    skills?: Array<{
      source?: string;
      skillId?: string;
      name?: string;
      installs?: number;
      description?: string;
      isOfficial?: boolean;
      weeklyInstalls?: number[];
      installsYesterday?: number;
      change?: number;
    }>;
    hasMore?: boolean;
  };
  const skills = (document.skills ?? [])
    .filter((item) => item.source && (item.skillId || item.name))
    .map((item) => {
      const skill: LeaderboardSkill = {
        name: (item.skillId || item.name) as string,
        package: item.source as string,
        installs: item.installs ?? 0,
      };
      if (typeof item.description === 'string' && item.description.trim()) {
        skill.description = item.description.trim();
      }
      if (item.isOfficial === true) skill.isOfficial = true;
      if (Array.isArray(item.weeklyInstalls)) skill.weeklyInstalls = item.weeklyInstalls;
      if (typeof item.installsYesterday === 'number') {
        skill.installsYesterday = item.installsYesterday;
      }
      if (typeof item.change === 'number') skill.change = item.change;
      return skill;
    });
  const hasMore = typeof document.hasMore === 'boolean'
    ? document.hasMore
    : skills.length >= 200;
  return { skills, hasMore };
}

/** 只读取外部仓库包含的 skill，不执行安装。 */
export function inspectPackageSkills(packageId: string): PackageSkill[] {
  const result = spawnSync('npx', ['-y', 'skills', 'add', packageId, '-l'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.status !== 0) {
    throw new Error(`读取外部包失败：\n${normalizeLine(output).trim() || `exit ${result.status}`}`);
  }
  const skills = listPackageSkills(output);
  if (skills.length === 0) throw new Error(`外部包未发现 skill：${packageId}`);
  return skills;
}

/** 从 skills CLI 的列表输出中提取 skill 名称与介绍。 */
export function listPackageSkills(output: string): PackageSkill[] {
  const lines = output.split(/\r?\n/).map(normalizeLine);
  const skills: PackageSkill[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const name = lines[index]?.match(/^\s{2,6}([a-z0-9][a-z0-9-]*)\s*$/i)?.[1];
    if (!name) continue;
    const descriptionParts: string[] = [];
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next] ?? '';
      if (/^\s{2,6}[a-z0-9][a-z0-9-]*\s*$/i.test(line)) break;
      if (/Use --skill/.test(line)) break;
      if (line.trim()) descriptionParts.push(line.trim());
    }
    skills.push({ name, description: descriptionParts.join(' ') });
  }
  return skills;
}

/** 去除 ANSI 和 clack 边框，保留用于解析的缩进。 */
function normalizeLine(line: string): string {
  return line
    .replace(ANSI_PATTERN, '')
    .replace(/^[│┃║]\s?/, '  ')
    .replace(/^[◇◆●■└├┌]\s?/, '');
}
