import { Command } from '@oclif/core';
import { readSkillUsageSummary } from '../../core/skill-usage.js';

export default class UsageStatus extends Command {
  static override description = '查看本机 skill 读取次数';

  override async run(): Promise<void> {
    const summary = readSkillUsageSummary();
    if (summary.skills.length === 0) {
      this.log('还没有 skill 读取记录');
      return;
    }
    for (const skill of summary.skills) {
      this.log(`${skill.name}\t${skill.readCount}\t${skill.lastReadAt}`);
    }
    this.log(`合计 ${summary.readCount} 次，${summary.skillCount} 个 skill`);
  }
}
