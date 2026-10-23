import { Command, Flags } from '@oclif/core';
import * as p from '@clack/prompts';
import {
  initializeCliConfig,
  peekCliConfig,
  resolveCliConfigPath,
  resolveRequiredAbsolutePath,
  resolveSkillCacheDir,
  type CliConfig,
} from '../core/cli-config.js';
import { isGitRemoteSource } from '../core/source-git.js';
import { CATEGORIES_FILE, CLI_NAME, SKILLS_FILE } from '../core/brand.js';

export default class Init extends Command {
  static override description = '初始化 skill 源目录和缓存目录';
  static override flags = {
    source: Flags.string({
      char: 's',
      description: 'skill 源：绝对路径或 git 远程地址；缺少配置表时生成带远程示例的 skillctl-skills.json 与 skillctl-categories.json',
    }),
    cache: Flags.string({
      description: '外部 skill 缓存目录，必须使用绝对路径；未指定时使用脚本目录 .cache',
    }),
    force: Flags.boolean({ char: 'f', default: false, description: '覆盖已有本机配置' }),
  };

  /** 先绑定源目录，再绑定缓存目录；已有配置时询问覆盖或保留。 */
  override async run(): Promise<void> {
    const { flags } = await this.parse(Init);
    p.intro(`${CLI_NAME} init`);
    const existing = peekCliConfig();
    if (existing && process.stdin.isTTY && !flags.force) {
      const kept = await promptKeepOrOverwrite(existing);
      if (kept) {
        logCliConfig(this.log.bind(this), existing);
        p.outro('已保留原有配置');
        return;
      }
    }
    if (!flags.source && !process.stdin.isTTY) {
      this.error(`未配置 skill 源目录，请先运行 ${CLI_NAME} init --source <绝对路径或 git 地址>`);
    }
    const sourceDir = flags.source
      ? flags.source.trim()
      : await promptSourceInput(
        existing?.sourceRemote ?? existing?.sourceDir,
      );
    const cacheDir = flags.cache
      ? resolveRequiredAbsolutePath(flags.cache, '缓存目录')
      : process.stdin.isTTY
        ? await promptAbsoluteDir(
          '缓存目录（必须使用绝对路径）',
          resolveSkillCacheDir(),
          existing?.cacheDir ?? resolveSkillCacheDir(),
        )
        : resolveSkillCacheDir();
    const config = initializeCliConfig({
      sourceDir,
      cacheDir,
      force: flags.force || Boolean(existing && process.stdin.isTTY),
    });
    logCliConfig(this.log.bind(this), config);
    p.outro('初始化完成');
  }
}

/** 已有本机配置时让用户选择覆盖或保留，不抛错。 */
async function promptKeepOrOverwrite(existing: CliConfig): Promise<boolean> {
  const choice = await p.select({
    message: `配置已存在\n  源目录：${existing.sourceDir}\n  缓存目录：${existing.cacheDir}`,
    options: [
      { value: 'keep', label: '保留原有配置' },
      { value: 'overwrite', label: '覆盖并重新配置' },
    ],
    initialValue: 'keep',
  });
  if (p.isCancel(choice)) throw new Error('已取消');
  return choice === 'keep';
}

/** 打印本机配置和源目录中的注册表、分类表路径。 */
function logCliConfig(log: (message: string) => void, config: CliConfig): void {
  log(`本机配置：${resolveCliConfigPath()}`);
  log(`skill 源：${config.sourceDir}`);
  if (config.sourceRemote) log(`远程源：${config.sourceRemote}`);
  log(`缓存目录：${config.cacheDir}`);
  log(`注册表：${config.sourceDir}/${SKILLS_FILE}`);
  log(`分类表：${config.sourceDir}/${CATEGORIES_FILE}`);
}

/** 交互收集 skill 源：绝对路径或 git 远程地址。 */
async function promptSourceInput(initialValue?: string): Promise<string> {
  const value = await p.text({
    message: 'skill 源（绝对路径或 git 远程地址）',
    placeholder: '/Users/name/skill-catalog 或 https://github.com/owner/repo.git',
    initialValue,
    validate: (input) => {
      if (!input?.trim()) return '不能为空，请填写绝对路径或 git 地址';
      if (isGitRemoteSource(input)) return undefined;
      try {
        resolveRequiredAbsolutePath(input, '源目录');
        return undefined;
      } catch (error) {
        return error instanceof Error ? error.message : '请使用绝对路径或 git 地址';
      }
    },
  });
  if (p.isCancel(value)) throw new Error('已取消');
  return (value as string).trim();
}

/** 交互收集必须为绝对路径的目录。 */
async function promptAbsoluteDir(
  message: string,
  placeholder: string,
  initialValue?: string,
): Promise<string> {
  const value = await p.text({
    message,
    placeholder,
    initialValue,
    validate: (input) => {
      if (!input?.trim()) return '目录不能为空，请使用绝对路径';
      try {
        resolveRequiredAbsolutePath(input, '目录');
        return undefined;
      } catch (error) {
        return error instanceof Error ? error.message : '请使用绝对路径';
      }
    },
  });
  if (p.isCancel(value)) throw new Error('已取消');
  return resolveRequiredAbsolutePath(value as string, '目录');
}
