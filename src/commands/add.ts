import { Args, Command, Flags } from '@oclif/core';
import * as p from '@clack/prompts';
import { CLI_NAME } from '../core/brand.js';
import { loadCliConfig } from '../core/cli-config.js';
import {
  addSkillsToRegistry,
  findUnregisteredLocalSkills,
  loadSkillCatalog,
  type SkillCatalog,
  type SkillRecord,
} from '../core/skill-registry.js';
import { inspectPackageSkills, searchSkills } from '../core/skills-source.js';

export default class Add extends Command {
  static override description = '将本地或 skills.sh skill 登记到配置表';
  static override args = {
    query: Args.string({ description: 'skills.sh 关键词或 owner/repo' }),
  };
  static override flags = {
    local: Flags.boolean({ default: false, description: '登记配置源 skills/ 中未配置的 skill' }),
  };

  /** 根据来源发现 skill，经用户选择后只更新配置表。 */
  override async run(): Promise<void> {
    const { args, flags } = await this.parse(Add);
    const { sourceDir } = loadCliConfig();
    const catalog = loadSkillCatalog(sourceDir);
    p.intro(`${CLI_NAME} add`);
    if (flags.local) {
      await registerLocalSkills(sourceDir, catalog);
      return;
    }
    if (!process.stdin.isTTY && !args.query) {
      this.error('非交互环境必须指定 owner/repo、搜索词或 --local');
    }
    const query = args.query ?? await promptText('输入 skills.sh 关键词或 owner/repo');
    const packageId = query.includes('/') ? query : await selectSearchPackage(query);
    await registerExternalSkills(sourceDir, catalog, packageId);
  }
}

/** 选择并登记本地源中尚未进入配置表的 skill。 */
async function registerLocalSkills(sourceDir: string, catalog: SkillCatalog): Promise<void> {
  const missing = findUnregisteredLocalSkills(sourceDir, catalog);
  if (missing.length === 0) {
    p.outro('没有新的本地 skill');
    return;
  }
  const selected = await promptSkills(
    '选择要登记的本地 skill',
    missing.map((skill) => ({ value: skill.name, label: skill.name, hint: skill.description })),
  );
  const categoryId = await promptCategory(catalog);
  const records: SkillRecord[] = [];
  for (const name of selected) {
    const skill = missing.find((item) => item.name === name);
    if (!skill) continue;
    records.push({ ...skill, description: await ensureChineseDescription(skill) });
  }
  addSkillsToRegistry(sourceDir, catalog, categoryId, records);
  p.outro(`已登记 ${records.length} 个本地 skill`);
}

/** 搜索 skills.sh 并选出一个外部包。 */
async function selectSearchPackage(query: string): Promise<string> {
  const results = await searchSkills(query);
  if (results.length === 0) throw new Error(`skills.sh 未找到：${query}`);
  const selected = await p.select({
    message: '选择外部包',
    options: results.map((item) => ({
      value: item.package,
      label: `${item.name} (${item.package})`,
      hint: `${item.installs} installs`,
    })),
  });
  if (p.isCancel(selected)) throw new Error('已取消');
  return selected as string;
}

/** 列出包内子 skill，选择后写入注册表和分类表。 */
async function registerExternalSkills(
  sourceDir: string,
  catalog: SkillCatalog,
  packageId: string,
): Promise<void> {
  const available = inspectPackageSkills(packageId)
    .filter((skill) => !catalog.skills.some((item) => item.name === skill.name));
  if (available.length === 0) {
    p.outro('该包没有可新增的 skill');
    return;
  }
  const selected = await promptSkills(
    '选择要加入配置表的子 skill',
    available.map((skill) => ({ value: skill.name, label: skill.name, hint: skill.description })),
  );
  const categoryId = await promptCategory(catalog);
  const records: SkillRecord[] = [];
  for (const name of selected) {
    const skill = available.find((item) => item.name === name);
    if (!skill) continue;
    records.push({
      id: skill.name,
      package: packageId,
      name: skill.name,
      description: await promptChineseDescription(skill.name, skill.description),
      version: '*',
      source: `https://github.com/${packageId}`,
      type: 'external',
      enabled: true,
    });
  }
  addSkillsToRegistry(sourceDir, catalog, categoryId, records);
  p.outro(`已登记 ${records.length} 个外部 skill；尚未执行安装`);
}

/** 从已有分类中选择唯一归属。 */
async function promptCategory(catalog: SkillCatalog): Promise<string> {
  const selected = await p.select({
    message: '选择分类',
    options: catalog.categories.map((category) => ({
      value: category.id,
      label: category.name,
      hint: category.description,
    })),
  });
  if (p.isCancel(selected)) throw new Error('已取消');
  return selected as string;
}

/** 多选 skill 并把取消操作转换成明确错误。 */
async function promptSkills(
  message: string,
  options: Array<{ value: string; label: string; hint: string }>,
): Promise<string[]> {
  const selected = await p.multiselect({ message, options, required: true });
  if (p.isCancel(selected)) throw new Error('已取消');
  return selected as string[];
}

/** 对非中文介绍发起补全，确保配置表适合中文展示。 */
async function ensureChineseDescription(skill: SkillRecord): Promise<string> {
  if (/[\u4e00-\u9fff]/.test(skill.description)) return skill.description;
  return promptChineseDescription(skill.name, skill.description);
}

/** 提示输入中文介绍并校验非空和中文字符。 */
async function promptChineseDescription(name: string, initialValue: string): Promise<string> {
  const value = await p.text({
    message: `${name} 的中文介绍`,
    initialValue,
    validate: (input) => /[\u4e00-\u9fff]/.test(input ?? '') ? undefined : '请输入中文介绍',
  });
  if (p.isCancel(value)) throw new Error('已取消');
  return value as string;
}

/** 获取必填文本输入。 */
async function promptText(message: string): Promise<string> {
  const value = await p.text({
    message,
    validate: (input) => input?.trim() ? undefined : '不能为空',
  });
  if (p.isCancel(value)) throw new Error('已取消');
  return (value as string).trim();
}
