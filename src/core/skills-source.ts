import { spawnSync } from 'node:child_process';

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, 'g');

export interface SkillsSearchResult {
  name: string;
  slug: string;
  package: string;
  installs: number;
}

export interface PackageSkill {
  name: string;
  description: string;
}

/** 通过 skills.sh 搜索接口查询可登记的外部 skill。 */
export async function searchSkills(
  query: string,
  request: typeof fetch = fetch,
): Promise<SkillsSearchResult[]> {
  const params = new URLSearchParams({ q: query, limit: '10' });
  const response = await request(`https://skills.sh/api/search?${params.toString()}`);
  if (!response.ok) throw new Error(`skills.sh 搜索失败：HTTP ${response.status}`);
  const document = await response.json() as {
    skills?: Array<{ id?: string; name?: string; installs?: number; source?: string }>;
  };
  return (document.skills ?? [])
    .filter((item) => item.id && item.name && item.source)
    .map((item) => ({
      name: item.name as string,
      slug: item.id as string,
      package: item.source as string,
      installs: item.installs ?? 0,
    }))
    .sort((left, right) => right.installs - left.installs);
}

/** 只读取外部仓库包含的 skill，不执行安装。 */
export function inspectPackageSkills(packageId: string): PackageSkill[] {
  const result = spawnSync('npx', ['-y', 'skills', 'add', packageId, '-l'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.status !== 0) {
    throw new Error(`读取外部包失败：${normalizeLine(output).trim() || `exit ${result.status}`}`);
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
