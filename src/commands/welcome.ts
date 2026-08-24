import { Command } from '@oclif/core';
import * as p from '@clack/prompts';
import { renderBanner } from '../ui/banner.js';
import { style } from '../ui/style.js';

type Choice = 'init' | 'install' | 'add' | 'manage' | 'exit';

export default class Welcome extends Command {
  static override hidden = true;
  static override description = '显示 banner 与交互式命令菜单';

  override async run(): Promise<void> {
    this.log(renderBanner(this.config.version));

    if (!process.stdin.isTTY) {
      this.log(style.dim('非 TTY 环境，跳过交互菜单。使用 --help 查看完整命令列表。'));
      return;
    }

    const options: { value: Choice; label: string }[] = [
      { value: 'init', label: 'init     ' + style.dim('配置源目录和缓存目录') },
      { value: 'install', label: 'install  ' + style.dim('检查、准备并安装已登记 skill') },
      { value: 'add', label: 'add      ' + style.dim('把本地或 skills.sh skill 加入配置表') },
      { value: 'manage', label: 'manage   ' + style.dim('打开 Workspace 与已安装 Skill 管理页') },
      { value: 'exit', label: '退出' },
    ];
    const choice = await p.select({
      message: '选择一个命令继续（或 Ctrl+C 退出）',
      options,
      initialValue: 'install' as Choice,
    });

    if (p.isCancel(choice) || choice === 'exit') {
      p.outro('再见');
      return;
    }

    this.log('');
    try {
      await this.config.runCommand(choice as Choice, []);
    } catch (err) {
      if (isOclifExit(err)) return;
      const message = err instanceof Error ? err.message : String(err);
      this.error(message || '命令执行失败', { exit: 1 });
    }
  }
}

function isOclifExit(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === 'object' &&
      'oclif' in err &&
      typeof (err as { oclif?: { exit?: number } }).oclif?.exit === 'number',
  );
}
