import { Command, Flags } from '@oclif/core';
import { spawn } from 'node:child_process';
import { startManagerServer } from '../core/manager-server.js';

export default class Manage extends Command {
  static override description = '启动本机已安装 Skill 与配置表的可视化管理页面';
  static override flags = {
    port: Flags.integer({
      char: 'p',
      default: 4173,
      min: 0,
      max: 65535,
      description: '本地服务端口，传 0 时自动分配',
    }),
    open: Flags.boolean({
      default: true,
      allowNo: true,
      description: '启动后自动打开浏览器',
    }),
  };

  /** 启动仅监听回环地址的管理服务，并保持运行直到用户终止。 */
  override async run(): Promise<void> {
    const { flags } = await this.parse(Manage);
    const manager = await startManagerServer({ port: flags.port });
    this.log(`已安装 Skill：${manager.url}`);
    this.log(`配置表：${manager.url}/catalog`);
    this.log('按 Ctrl+C 停止服务');
    if (flags.open) openBrowser(manager.url);
    await new Promise<void>((resolvePromise) => {
      process.once('SIGINT', () => manager.server.close(() => resolvePromise()));
      process.once('SIGTERM', () => manager.server.close(() => resolvePromise()));
    });
  }
}

/** 使用当前操作系统默认浏览器打开管理页面，不阻塞 CLI 服务。 */
function openBrowser(url: string): void {
  const command = process.platform === 'darwin'
    ? { file: 'open', args: [url] }
    : process.platform === 'win32'
      ? { file: 'cmd', args: ['/c', 'start', '', url] }
      : { file: 'xdg-open', args: [url] };
  const child = spawn(command.file, command.args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}
