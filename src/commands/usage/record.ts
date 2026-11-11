import { Command, Flags } from '@oclif/core';
import { recordSkillRead } from '../../core/skill-usage.js';

export default class UsageRecord extends Command {
  static override description = '记录 skill 读取。同一次会话里的每次读取都计入';
  static override flags = {
    name: Flags.string({ required: true, description: 'skill 名称' }),
    path: Flags.string({ required: true, description: '被读取的 skill 文件路径' }),
    conversation: Flags.string({ description: '会话 id。只用于标记来源，不限制次数' }),
    count: Flags.integer({ min: 1, max: 1000, default: 1, description: '本次计入的次数' }),
    quiet: Flags.boolean({ default: false, description: '成功时不输出' }),
  };

  override async run(): Promise<void> {
    const { flags } = await this.parse(UsageRecord);
    const result = recordSkillRead({
      name: flags.name,
      path: flags.path,
      conversationId: flags.conversation,
      count: flags.count,
    });
    if (!flags.quiet) this.log(`${result.recorded ? 'recorded' : 'ignored'}: ${result.name} ${result.readCount}`);
  }
}
