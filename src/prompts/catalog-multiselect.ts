import { Prompt, isCancel } from '@clack/core';
import chalk from 'chalk';
import type { SkillCatalog, SkillRecord } from '../core/skill-registry.js';

export interface CatalogOption {
  value: string;
  label: string;
  hint?: string;
  depth: number;
  isGroup: boolean;
  groupId: string;
}

/** 按分类展平为「分类行 + 缩进 skill 行」，供分组多选渲染。 */
export function buildCatalogOptions(catalog: SkillCatalog): CatalogOption[] {
  const byId = new Map(catalog.skills.map((skill) => [skill.id, skill]));
  const options: CatalogOption[] = [];
  const assigned = new Set<string>();
  for (const category of catalog.categories) {
    const skills = category.skillIds
      .map((skillId) => byId.get(skillId))
      .filter((skill): skill is SkillRecord => Boolean(skill));
    if (skills.length === 0) continue;
    options.push({
      value: category.id,
      label: category.name,
      hint: category.description,
      depth: 0,
      isGroup: true,
      groupId: category.id,
    });
    for (const skill of skills) {
      assigned.add(skill.id);
      options.push({
        value: skill.id,
        label: skill.name,
        hint: skill.enabled === false ? `${skill.description} · 未启用` : skill.description,
        depth: 1,
        isGroup: false,
        groupId: category.id,
      });
    }
  }
  const leftover = catalog.skills.filter((skill) => !assigned.has(skill.id));
  if (leftover.length === 0) return options;
  options.push({
    value: '__uncategorized__',
    label: '未分类',
    depth: 0,
    isGroup: true,
    groupId: '__uncategorized__',
  });
  for (const skill of leftover) {
    options.push({
      value: skill.id,
      label: skill.name,
        hint: skill.enabled === false ? `${skill.description} · 未启用` : skill.description,
      depth: 1,
      isGroup: false,
      groupId: '__uncategorized__',
    });
  }
  return options;
}

/** 空格切换当前行：分类行联动其下全部 skill。 */
export function toggleCatalogSelection(
  options: CatalogOption[],
  selected: string[],
  cursor: number,
): string[] {
  const current = options[cursor];
  if (!current) return selected;
  const childIds = options
    .filter((item) => !item.isGroup && item.groupId === current.groupId)
    .map((item) => item.value);
  if (current.isGroup) {
    const allSelected = childIds.every((id) => selected.includes(id));
    return allSelected
      ? selected.filter((id) => !childIds.includes(id))
      : [...new Set([...selected, ...childIds])];
  }
  return selected.includes(current.value)
    ? selected.filter((id) => id !== current.value)
    : [...selected, current.value];
}

/** 交互选择要安装的 skill：分类多选，子项缩进，选中分类即选中全部子 skill。 */
export async function promptCatalogSkills(catalog: SkillCatalog): Promise<SkillRecord[]> {
  const options = buildCatalogOptions(catalog);
  if (options.length === 0) throw new Error('配置表中没有可安装的 skill');
  const selected = await promptGroupedSkills(options);
  if (isCancel(selected)) throw new Error('已取消');
  const ids = new Set(selected as string[]);
  const skills = catalog.skills.filter((skill) => ids.has(skill.id));
  if (skills.length === 0) throw new Error('请至少选择一项');
  return skills;
}

class CatalogGroupPrompt extends Prompt {
  options: CatalogOption[];
  cursor = 0;
  declare value: string[];

  constructor(opts: {
    options: CatalogOption[];
    validate?: (values: string[]) => string | void;
    render: (this: CatalogGroupPrompt) => string | void;
  }) {
    super(opts as ConstructorParameters<typeof Prompt>[0], false);
    this.options = opts.options;
    this.value = [];
    this.cursor = 0;
    this.on('cursor', (key) => {
      if (key === 'left' || key === 'up') {
        this.cursor = this.cursor === 0 ? this.options.length - 1 : this.cursor - 1;
        return;
      }
      if (key === 'down' || key === 'right') {
        this.cursor = this.cursor === this.options.length - 1 ? 0 : this.cursor + 1;
        return;
      }
      if (key === 'space') this.value = toggleCatalogSelection(this.options, this.value, this.cursor);
    });
  }

  isGroupSelected(groupId: string): boolean {
    const childIds = this.options
      .filter((item) => !item.isGroup && item.groupId === groupId)
      .map((item) => item.value);
    return childIds.length > 0 && childIds.every((id) => this.value.includes(id));
  }
}

/** 打开带视口滚动的分组多选。 */
async function promptGroupedSkills(options: CatalogOption[]): Promise<string[] | symbol> {
  let maxItems = getPromptMaxItems();
  let sliceViewport = createViewportScroller(maxItems);
  const onResize = (): void => {
    maxItems = getPromptMaxItems();
    sliceViewport = createViewportScroller(maxItems);
  };
  if (process.stdout.isTTY) process.stdout.on('resize', onResize);
  try {
    const prompt = new CatalogGroupPrompt({
      options,
      validate: (values) => (values.length === 0 ? '请至少选择一项' : undefined),
      render() {
        return renderCatalogPrompt(this, sliceViewport);
      },
    });
    return await prompt.prompt() as string[] | symbol;
  } finally {
    if (process.stdout.isTTY) process.stdout.off('resize', onResize);
  }
}

const bar = chalk.gray('|');
const corner = chalk.gray('└');
const activeBox = chalk.cyan('◻');
const selectedBox = chalk.green('◼');
const idleBox = chalk.dim('◻');

/** 根据终端高度估算列表最多展示行数。 */
function getPromptMaxItems(): number {
  const reservedLines = 10;
  const rows = process.stdout.isTTY ? process.stdout.rows : 12;
  if (!rows || rows < reservedLines + 5) return 5;
  return Math.max(5, Math.min(24, rows - reservedLines));
}

/** 与 clack select 相同的滑动窗口，offset 在多次渲染间保持。 */
function createViewportScroller(maxItems: number) {
  let offset = 0;
  return function sliceViewport<T>(items: T[], cursor: number): {
    window: T[];
    offset: number;
    hasMoreAbove: boolean;
    hasMoreBelow: boolean;
  } {
    if (items.length <= maxItems) {
      offset = 0;
      return { window: items, offset: 0, hasMoreAbove: false, hasMoreBelow: false };
    }
    if (cursor >= offset + maxItems - 3) {
      offset = Math.max(Math.min(cursor - maxItems + 3, items.length - maxItems), 0);
    } else if (cursor < offset + 2) {
      offset = Math.max(cursor - 2, 0);
    }
    return {
      window: items.slice(offset, offset + maxItems),
      offset,
      hasMoreAbove: offset > 0,
      hasMoreBelow: offset + maxItems < items.length,
    };
  };
}

/** 渲染分组多选的当前帧。 */
function renderCatalogPrompt(
  prompt: CatalogGroupPrompt & { state: string; error?: string },
  sliceViewport: ReturnType<typeof createViewportScroller>,
): string {
  const head = `${chalk.gray('|')}\n${stateIcon(prompt.state)}  选择要安装的 skill\n`;
  if (prompt.state === 'submit') {
    const labels = prompt.options
      .filter((item) => !item.isGroup && prompt.value.includes(item.value))
      .map((item) => chalk.dim(item.label));
    return `${head}${chalk.gray('|')}  ${labels.join(chalk.dim(', '))}`;
  }
  if (prompt.state === 'cancel') return `${head}${chalk.gray('|')}  ${chalk.dim('已取消')}`;
  const tone = prompt.state === 'error' ? 'yellow' : 'cyan';
  const body = renderVisibleOptions(prompt, sliceViewport, tone);
  if (prompt.state === 'error') {
    return `${head}${chalk.yellow('|')}  ${body}\n${chalk.yellow('└')}  ${chalk.yellow(prompt.error ?? '')}`;
  }
  return `${head}${chalk.cyan('|')}  ${body}\n${chalk.cyan('└')}`;
}

function stateIcon(state: string): string {
  if (state === 'cancel') return chalk.red('■');
  if (state === 'error') return chalk.yellow('▲');
  if (state === 'submit') return chalk.green('◆');
  return chalk.cyan('◆');
}

/** 按光标窗口输出分类和缩进子 skill。 */
function renderVisibleOptions(
  prompt: CatalogGroupPrompt,
  sliceViewport: ReturnType<typeof createViewportScroller>,
  tone: 'cyan' | 'yellow',
): string {
  const border = tone === 'cyan' ? chalk.cyan(bar) : chalk.yellow(bar);
  const { window, offset, hasMoreAbove, hasMoreBelow } = sliceViewport(
    prompt.options,
    prompt.cursor,
  );
  return window.map((item, windowIndex) => {
    const absoluteIndex = offset + windowIndex;
    let line = formatOption(item, optionMode(prompt, item, absoluteIndex), prompt.options, absoluteIndex);
    if (windowIndex === 0 && hasMoreAbove) line = chalk.dim('...');
    if (windowIndex === window.length - 1 && hasMoreBelow) line = chalk.dim('...');
    return line;
  }).join(`\n${border}  `);
}

function optionMode(
  prompt: CatalogGroupPrompt,
  item: CatalogOption,
  absoluteIndex: number,
): string {
  const selected = item.isGroup
    ? prompt.isGroupSelected(item.groupId)
    : prompt.value.includes(item.value);
  const active = absoluteIndex === prompt.cursor;
  const cursorItem = prompt.options[prompt.cursor];
  const cursorOnThisGroup = Boolean(
    cursorItem?.isGroup && item.isGroup && cursorItem.value === item.value,
  );
  if (!active && cursorOnThisGroup) return selected ? 'group-active-selected' : 'group-active';
  if (active && selected) return 'active-selected';
  if (selected) return 'selected';
  if (active) return 'active';
  return 'inactive';
}

function formatOption(
  item: CatalogOption,
  mode: string,
  all: CatalogOption[],
  index: number,
): string {
  const indent = '  '.repeat(item.depth);
  const branch = index < all.length - 1 && all[index + 1]?.isGroup ? corner : bar;
  const prefix = item.isGroup ? `${branch} ` : '  ';
  const hint = item.hint ? chalk.dim(` (${item.hint})`) : '';
  if (mode === 'active') {
    return `${chalk.dim(indent)}${chalk.dim(prefix)}${activeBox} ${item.label}${hint}`;
  }
  if (mode === 'group-active') return `${indent}${prefix}${activeBox} ${chalk.dim(item.label)}`;
  if (mode === 'group-active-selected') return `${indent}${prefix}${selectedBox} ${chalk.dim(item.label)}`;
  if (mode === 'selected') {
    return `${chalk.dim(indent)}${chalk.dim(prefix)}${selectedBox} ${chalk.dim(item.label)}`;
  }
  if (mode === 'active-selected') {
    return `${chalk.dim(indent)}${chalk.dim(prefix)}${selectedBox} ${item.label}${hint}`;
  }
  return `${chalk.dim(indent)}${chalk.dim(prefix)}${idleBox} ${chalk.dim(item.label)}`;
}
