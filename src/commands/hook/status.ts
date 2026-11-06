import { Command } from '@oclif/core';
import { readCursorUsageHookStatus } from '../../core/cursor-usage-hook.js';
import { readSkillUsageSummary, resolveSkillUsagePath } from '../../core/skill-usage.js';

export default class HookStatus extends Command {
  static override description = '查看 Cursor 和 Codex 的 skill 读取记录 hook 是否已安装';

  override async run(): Promise<void> {
    const status = readCursorUsageHookStatus();
    const summary = readSkillUsageSummary();
    this.log(`Cursor hook：${status.hookInstalled ? '已安装' : '未安装'} ${status.hooksPath}`);
    this.log(`Codex hook：${status.codexHookInstalled ? '已安装' : '未安装'} ${status.codexHooksPath}`);
    this.log(`skill：${status.skillInstalled ? '已安装' : '未安装'} ${status.skillPath}`);
    this.log(`记录：${summary.readCount} 次，${summary.skillCount} 个 skill，${resolveSkillUsagePath()}`);
  }
}
