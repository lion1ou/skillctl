import figlet from 'figlet';
import { CLI_NAME } from '../core/brand.js';
import { VERSION } from '../index.js';
import { style } from './style.js';

export function renderBanner(version = VERSION): string {
  const art = figlet.textSync(CLI_NAME, {
    font: 'Small',
    horizontalLayout: 'fitted',
  });
  return [
    style.bold(art),
    `  ${style.bold(CLI_NAME)} ${style.dim(`v${version}`)}`,
    style.dim('  配置驱动的 Agent Skill 登记与安装工具'),
    '',
    style.dim('  常用命令：'),
    `    ${style.bold(`${CLI_NAME} install`)}  检查、准备并安装 skill`,
    `    ${style.bold(`${CLI_NAME} add`)}      将 skill 加入配置表`,
    `    ${style.bold(`${CLI_NAME} -v`)}       显示当前版本`,
    '',
  ].join('\n');
}
