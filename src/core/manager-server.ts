import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { homedir } from 'node:os';
import { loadCliConfig } from './cli-config.js';
import {
  createCatalogCategory,
  loadCatalogWorkspace,
  patchCatalogCategory,
  patchCatalogSkill,
  removeCatalogCategory,
  removeCatalogSkill,
  syncUnregisteredSkills,
} from './catalog-editor.js';
import { installCatalogSkills, spawnExternalSkillAdd } from './catalog-install.js';
import { scanInstalledWorkspace, setManagedSkillEnabled } from './skill-manager.js';
import { getTarget, type TargetId } from './targets.js';
import { CATALOG_PAGE } from '../ui/catalog-page.js';
import { MANAGER_PAGE } from '../ui/manager-page.js';

export interface ManagerServer {
  server: Server;
  url: string;
}

/** 在本机回环地址启动管理服务，并用随机令牌保护写操作与扫描结果。 */
export async function startManagerServer(options: {
  port: number;
  userRoot?: string;
}): Promise<ManagerServer> {
  const token = randomBytes(24).toString('hex');
  const server = createServer((request, response) => {
    void routeManagerRequest(request, response, token, options.userRoot);
  });
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(options.port, '127.0.0.1', () => {
      server.off('error', reject);
      resolvePromise();
    });
  });
  const address = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${address.port}` };
}

/** 仅暴露已安装页、配置表页和对应接口，其他请求统一返回 404。 */
async function routeManagerRequest(
  request: IncomingMessage,
  response: ServerResponse,
  token: string,
  userRoot?: string,
): Promise<void> {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, MANAGER_PAGE.replace('__SKILLCTL_TOKEN__', JSON.stringify(token)));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/catalog') {
      sendHtml(response, CATALOG_PAGE.replace('__SKILLCTL_TOKEN__', JSON.stringify(token)));
      return;
    }
    if (request.headers['x-skillctl-token'] !== token) {
      sendText(response, 403, '无权访问本机 Skill');
      return;
    }
    if (await routeInstalledApi(request, response, url, userRoot)) return;
    if (await routeCatalogApi(request, response, url)) return;
    sendText(response, 404, 'Not Found');
  } catch (error) {
    sendText(response, 400, error instanceof Error ? error.message : '请求处理失败');
  }
}

/** 处理已安装 Agent 扫描、文件启停和按分类安装。 */
async function routeInstalledApi(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  userRoot?: string,
): Promise<boolean> {
  if (request.method === 'GET' && url.pathname === '/api/skills') {
    sendJson(response, scanInstalledWorkspace(userRoot));
    return true;
  }
  if (request.method === 'PATCH' && url.pathname === '/api/skills/toggle') {
    const input = await readJson(request, 4096);
    if (typeof input.target !== 'string' || typeof input.relativeDir !== 'string') {
      throw new Error('target 和 relativeDir 必须是字符串');
    }
    if (typeof input.isEnabled !== 'boolean') throw new Error('isEnabled 必须是布尔值');
    getTarget(input.target);
    sendJson(response, setManagedSkillEnabled({
      userRoot,
      target: input.target as TargetId,
      relativeDir: input.relativeDir,
      isEnabled: input.isEnabled,
    }));
    return true;
  }
  if (request.method === 'POST' && url.pathname === '/api/skills/install') {
    const input = await readJson(request, 8192);
    getTarget(readString(input.target, 'target'));
    const mode = input.mode === 'copy' ? 'copy' : 'symlink';
    const categoryIds = asStringArray(input.categoryIds);
    const skillIds = asStringArray(input.skillIds);
    const { sourceDir, cacheDir } = loadCliConfig();
    const result = await installCatalogSkills({
      sourceDir,
      cacheDir,
      scopeRoot: userRoot ?? homedir(),
      targets: [input.target as TargetId],
      selection: { categoryIds, skillIds },
      mode,
      force: input.force === true,
      runExternalPrepare: async (prepare) => {
        await spawnExternalSkillAdd(prepare.packageId, prepare.skillNames, prepare.cachePackageDir);
      },
    });
    sendJson(response, {
      ...scanInstalledWorkspace(userRoot),
      install: result,
    });
    return true;
  }
  return false;
}

/** 处理配置表的读取、编辑和本地 skill 同步。 */
async function routeCatalogApi(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  const sourceDir = loadCliConfig().sourceDir;
  if (request.method === 'GET' && url.pathname === '/api/catalog') {
    sendJson(response, loadCatalogWorkspace(sourceDir));
    return true;
  }
  if (request.method === 'PATCH' && url.pathname === '/api/catalog/skills') {
    const input = await readJson(request, 8192);
    sendJson(response, patchCatalogSkill(sourceDir, readId(input), {
      description: optionalString(input.description),
      enabled: optionalBoolean(input.enabled),
      categoryId: optionalString(input.categoryId),
    }));
    return true;
  }
  if (request.method === 'DELETE' && url.pathname === '/api/catalog/skills') {
    sendJson(response, removeCatalogSkill(sourceDir, queryId(url)));
    return true;
  }
  if (request.method === 'POST' && url.pathname === '/api/catalog/categories') {
    const input = await readJson(request, 4096);
    sendJson(response, createCatalogCategory(sourceDir, {
      id: readString(input.id, 'id'),
      name: readString(input.name, 'name'),
      description: readString(input.description, 'description'),
    }));
    return true;
  }
  if (request.method === 'PATCH' && url.pathname === '/api/catalog/categories') {
    const input = await readJson(request, 4096);
    sendJson(response, patchCatalogCategory(sourceDir, readId(input), {
      name: optionalString(input.name),
      description: optionalString(input.description),
    }));
    return true;
  }
  if (request.method === 'DELETE' && url.pathname === '/api/catalog/categories') {
    sendJson(response, removeCatalogCategory(sourceDir, queryId(url)));
    return true;
  }
  if (request.method === 'POST' && url.pathname === '/api/catalog/sync') {
    const input = await readJson(request, 8192);
    const skillIds = Array.isArray(input.skillIds)
      ? input.skillIds.filter((item): item is string => typeof item === 'string')
      : undefined;
    sendJson(response, syncUnregisteredSkills(sourceDir, readString(input.categoryId, 'categoryId'), skillIds));
    return true;
  }
  return false;
}

/** 限制请求体大小并解析 JSON，避免本地服务接受超大或非法负载。 */
async function readJson(request: IncomingMessage, maxBytes: number): Promise<Record<string, unknown>> {
  let body = '';
  for await (const chunk of request) {
    body += String(chunk);
    if (body.length > maxBytes) throw new Error('请求体过大');
  }
  const value = JSON.parse(body) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('请求体必须是对象');
  return value as Record<string, unknown>;
}

/** 从 JSON 读取必填 id。 */
function readId(input: Record<string, unknown>): string {
  return readString(input.id, 'id');
}

/** 从查询参数读取必填 id。 */
function queryId(url: URL): string {
  const id = url.searchParams.get('id')?.trim();
  if (!id) throw new Error('缺少 id');
  return id;
}

/** 读取必填字符串字段。 */
function readString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} 必须是非空字符串`);
  return value.trim();
}

/** 读取可选字符串字段。 */
function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error('字段必须是字符串');
  return value;
}

/** 读取可选字符串数组字段。 */
function asStringArray(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('字段必须是字符串数组');
  return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()));
}

/** 读取可选布尔字段。 */
function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new Error('字段必须是布尔值');
  return value;
}

/** 返回 JSON，并禁止浏览器缓存本机实时状态。 */
function sendJson(response: ServerResponse, value: unknown): void {
  response.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(value));
}

/** 返回内嵌管理页面，并限制页面只能访问当前本地服务。 */
function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
    'cache-control': 'no-store',
  });
  response.end(html);
}

/** 以纯文本返回明确的 HTTP 错误。 */
function sendText(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(message);
}
