import { Command } from '@oclif/core';
import { installCursorUsageHook } from '../../core/cursor-usage-hook.js';

export default class HookInstall extends Command {
  static override description = '安装 Cursor、Codex 和 Claude 的 skill 读取记录 hook，并放入 skillctl-usage skill';

  override async run(): Promise<void> {
    const status = installCursorUsageHook({
      nodePath: process.execPath,
      cliEntry: process.argv[1],
    });
    this.log(`已安装 Cursor 读取记录 hook：${status.hooksPath}`);
    this.log(`已安装 Codex 读取记录 hook：${status.codexHooksPath}`);
    this.log(`已安装 Claude 读取记录 hook：${status.claudeHooksPath}`);
    this.log(`已安装 skill：${status.skillPath}`);
  }
}
