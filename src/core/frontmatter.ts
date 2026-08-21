/** 解析 SKILL.md 顶部 YAML frontmatter 中的标量字段，支持多行 description。 */
export function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return {};
  const lines = match[1].split(/\r?\n/);
  const metadata: Record<string, string> = {};
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const field = line.match(/^([a-zA-Z][\w-]*):\s*(.*?)\s*$/);
    if (!field) {
      index += 1;
      continue;
    }
    const key = field[1];
    const rawValue = field[2] ?? '';
    const block = rawValue.match(/^([|>])([+-])?$/);
    if (block) {
      index += 1;
      const collected: string[] = [];
      let baseIndent: number | null = null;
      while (index < lines.length) {
        const current = lines[index];
        if (current.trim() === '') {
          collected.push('');
          index += 1;
          continue;
        }
        const indent = current.match(/^(\s*)/)?.[1].length ?? 0;
        if (indent === 0) break;
        if (baseIndent === null) baseIndent = indent;
        collected.push(current.slice(Math.min(baseIndent, indent)));
        index += 1;
      }
      while (collected.length > 0 && collected.at(-1) === '') collected.pop();
      const text = block[1] === '>'
        ? collected.map((part) => part.trim()).filter(Boolean).join(' ')
        : collected.join('\n').trim();
      if (text) metadata[key] = text;
      continue;
    }
    if (rawValue === '') {
      index += 1;
      while (index < lines.length) {
        const current = lines[index];
        if (current.trim() === '' || /^\s/.test(current)) {
          index += 1;
          continue;
        }
        break;
      }
      continue;
    }
    const value = unwrapScalar(rawValue);
    if (value) metadata[key] = value;
    index += 1;
  }
  return metadata;
}

/** 去掉成对引号。 */
function unwrapScalar(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/** 把多行描述压成单段文本，避免卡片里换行错位。 */
export function normalizeSkillDescription(value: string | undefined, fallback = '无描述'): string {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}
