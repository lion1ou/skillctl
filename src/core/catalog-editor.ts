import {
  addSkillsToRegistry,
  findUnregisteredLocalSkills,
  loadSkillCatalog,
  saveSkillCatalog,
  type CategoryRecord,
  type SkillCatalog,
  type SkillRecord,
} from './skill-registry.js';

export interface CatalogWorkspace {
  sourceDir: string;
  catalog: SkillCatalog;
  unregistered: SkillRecord[];
  uncategorized: SkillRecord[];
}

export interface CatalogSkillPatch {
  description?: string;
  enabled?: boolean;
  categoryId?: string;
}

export interface CatalogCategoryPatch {
  name?: string;
  description?: string;
}

/** 读取配置表、未分类项和尚未登记的本地 skill，供配置页展示。 */
export function loadCatalogWorkspace(sourceDir: string): CatalogWorkspace {
  const catalog = loadSkillCatalog(sourceDir);
  const assigned = new Set(catalog.categories.flatMap((category) => category.skillIds));
  return {
    sourceDir,
    catalog,
    unregistered: findUnregisteredLocalSkills(sourceDir, catalog),
    uncategorized: catalog.skills.filter((skill) => !assigned.has(skill.id)),
  };
}

/** 更新配置表中的描述、启用状态或所属分类。 */
export function patchCatalogSkill(
  sourceDir: string,
  skillId: string,
  patch: CatalogSkillPatch,
): CatalogWorkspace {
  const catalog = loadSkillCatalog(sourceDir);
  const skill = requireSkill(catalog, skillId);
  if (patch.description !== undefined) {
    const description = patch.description.trim();
    if (!description) throw new Error('描述不能为空');
    skill.description = description;
  }
  if (patch.enabled !== undefined) skill.enabled = patch.enabled;
  if (patch.categoryId !== undefined) moveSkill(catalog, skillId, patch.categoryId);
  saveSkillCatalog(sourceDir, catalog);
  return loadCatalogWorkspace(sourceDir);
}

/** 从配置表删除 skill，不删除源目录文件。 */
export function removeCatalogSkill(sourceDir: string, skillId: string): CatalogWorkspace {
  const catalog = loadSkillCatalog(sourceDir);
  requireSkill(catalog, skillId);
  catalog.skills = catalog.skills.filter((skill) => skill.id !== skillId);
  for (const category of catalog.categories) {
    category.skillIds = category.skillIds.filter((id) => id !== skillId);
  }
  saveSkillCatalog(sourceDir, catalog);
  return loadCatalogWorkspace(sourceDir);
}

/** 新增空分类，供把 skill 归入新分组。 */
export function createCatalogCategory(
  sourceDir: string,
  input: { id: string; name: string; description: string },
): CatalogWorkspace {
  const catalog = loadSkillCatalog(sourceDir);
  const id = input.id.trim();
  const name = input.name.trim();
  const description = input.description.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error('分类 id 仅允许小写字母、数字和连字符');
  if (!name || !description) throw new Error('分类名称和描述不能为空');
  if (catalog.categories.some((category) => category.id === id)) throw new Error(`分类已存在：${id}`);
  catalog.categories.push({ id, name, description, skillIds: [] });
  saveSkillCatalog(sourceDir, catalog);
  return loadCatalogWorkspace(sourceDir);
}

/** 更新分类展示名称和描述，不改 id。 */
export function patchCatalogCategory(
  sourceDir: string,
  categoryId: string,
  patch: CatalogCategoryPatch,
): CatalogWorkspace {
  const catalog = loadSkillCatalog(sourceDir);
  const category = requireCategory(catalog, categoryId);
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error('分类名称不能为空');
    category.name = name;
  }
  if (patch.description !== undefined) {
    const description = patch.description.trim();
    if (!description) throw new Error('分类描述不能为空');
    category.description = description;
  }
  saveSkillCatalog(sourceDir, catalog);
  return loadCatalogWorkspace(sourceDir);
}

/** 删除没有 skill 的空分类。 */
export function removeCatalogCategory(sourceDir: string, categoryId: string): CatalogWorkspace {
  const catalog = loadSkillCatalog(sourceDir);
  const category = requireCategory(catalog, categoryId);
  if (category.skillIds.length > 0) throw new Error('请先移出分类下的 skill 再删除');
  catalog.categories = catalog.categories.filter((item) => item.id !== categoryId);
  saveSkillCatalog(sourceDir, catalog);
  return loadCatalogWorkspace(sourceDir);
}

/** 把尚未登记的本地 skill 同步进配置表并归入指定分类。 */
export function syncUnregisteredSkills(
  sourceDir: string,
  categoryId: string,
  skillIds?: string[],
): CatalogWorkspace {
  const catalog = loadSkillCatalog(sourceDir);
  requireCategory(catalog, categoryId);
  const missing = findUnregisteredLocalSkills(sourceDir, catalog);
  const selected = skillIds === undefined
    ? missing
    : missing.filter((skill) => skillIds.includes(skill.id));
  if (skillIds !== undefined && selected.length !== skillIds.length) {
    throw new Error('存在未知或已登记的本地 skill');
  }
  addSkillsToRegistry(sourceDir, catalog, categoryId, selected);
  return loadCatalogWorkspace(sourceDir);
}

/** 把 skill 从原分类移到目标分类。 */
function moveSkill(catalog: SkillCatalog, skillId: string, categoryId: string): void {
  const category = requireCategory(catalog, categoryId);
  for (const item of catalog.categories) {
    item.skillIds = item.skillIds.filter((id) => id !== skillId);
  }
  category.skillIds.push(skillId);
}

/** 读取配置表中的指定 skill。 */
function requireSkill(catalog: SkillCatalog, skillId: string): SkillRecord {
  const skill = catalog.skills.find((item) => item.id === skillId);
  if (!skill) throw new Error(`未知 skill：${skillId}`);
  return skill;
}

/** 读取配置表中的指定分类。 */
function requireCategory(catalog: SkillCatalog, categoryId: string): CategoryRecord {
  const category = catalog.categories.find((item) => item.id === categoryId);
  if (!category) throw new Error(`未知分类：${categoryId}`);
  return category;
}
