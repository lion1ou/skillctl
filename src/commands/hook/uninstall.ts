import { Command } from '@oclif/core';
import { uninstallCursorUsageHook } from '../../core/cursor-usage-hook.js';

export default class HookUninstall extends Command {
  static override description = '卸载 Cursor、Codex 和 Claude 的 skill 读取记录 hook，以及 skillctl-usage skill';

  override async run(): Promise<void> {
    const status = uninstallCursorUsageHook();
    this.log(`Cursor hook：${status.hookInstalled ? '仍安装' : '已移除'} ${status.hooksPath}`);
    this.log(`Codex hook：${status.codexHookInstalled ? '仍安装' : '已移除'} ${status.codexHooksPath}`);
    this.log(`Claude hook：${status.claudeHookInstalled ? '仍安装' : '已移除'} ${status.claudeHooksPath}`);
    this.log(`skill：${status.skillInstalled ? '仍保留' : '已移除'} ${status.skillPath}`);
    this.log('本机 usage.json 未删除');
  }
}
