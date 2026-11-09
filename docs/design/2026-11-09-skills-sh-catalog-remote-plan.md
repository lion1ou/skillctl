# skills.sh 管理页接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Native) or subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/catalog` 通过 skills.sh 免鉴权榜单/搜索浏览外部 skill，登记进用户源并可安装。

**Architecture:** 本机管理服务代理 `GET /api/skills/{view}/{page}` 与 `/api/search`；`catalog-remote` 负责探包+写表；安装复用 `installCatalogSkills` NDJSON。浏览器不直连 skills.sh。

**Tech Stack:** TypeScript、Node test runner、既有 manager-server / catalog-page。

**Spec:** `docs/design/2026-11-09-skills-sh-catalog-remote-design.md`

## Global Constraints

- 仅 skills.sh；榜单用免鉴权 `/api/skills/{view}/{page}`，不用 `/api/v1` OIDC。
- 安装失败保留登记；批量部分成功；补装含已登记项；选中 disabled 安装前 enable。
- 不改 CLI `add` 主流程；不新建分类；CSP 保持 `connect-src 'self'`。
- 测试放 `test/`；未要求不 commit。

## Review Focus

- skills.sh 非 JSON / 非 2xx：API 返回明确错误，配置表不变。
- 非 GitHub `source`（如 domain.com）：登记失败并说明，不写入。
- 搜索词 < 2：拒绝或空结果，不打远程。
- 同名已登记：跳过不算失败；add-install 仍可安装。
- add-install 安装失败：配置表新记录仍在。

---

### Task 1: skills.sh 榜单客户端

**Files:**
- Modify: `src/core/skills-source.ts`
- Test: `test/core-skills-source.test.ts`

**Interfaces:**
- Produces: `LeaderboardView = 'all-time' | 'trending' | 'hot'`
- Produces: `LeaderboardSkill { name, package, installs, change?, installsYesterday?, weeklyInstalls? }`
- Produces: `fetchLeaderboard(view, page, request?): Promise<{ skills: LeaderboardSkill[]; hasMore: boolean }>`
- Produces: `isGithubPackageSource(source: string): boolean`（`owner/repo` 形）

- [x] **Step 1:** 测试 `fetchLeaderboard` 解析 skills/hasMore，非法 view 抛错，HTTP 失败抛错；`isGithubPackageSource` 真假例。
- [x] **Step 2:** 跑测确认失败。
- [x] **Step 3:** 实现 `fetchLeaderboard` → `https://skills.sh/api/skills/${view}/${page}`；`name` 取 `skillId` 或 `name`；`package` 取 `source`。
- [x] **Step 4:** 跑测通过。扩展 `searchSkills` 可选 `limit`（默认 10，管理页用 30）若测试需要。

### Task 2: catalog-remote 登记编排

**Files:**
- Create: `src/core/catalog-remote.ts`
- Test: `test/core-catalog-remote.test.ts`

**Interfaces:**
- Consumes: `inspectPackageSkills`, `addSkillsToRegistry`, `loadSkillCatalog`, `saveSkillCatalog`, `isGithubPackageSource`
- Produces: `registerRemoteSkills(sourceDir, { categoryId, skills: { package, name, description? }[], descriptions?: Record<string,string> }, deps?): { added, skipped, failed }`
- Produces: `ensureSkillsEnabled(sourceDir, skillIds: string[]): void`

- [x] **Step 1:** 测试：跳过已存在；非 github package 进 failed；探包成功写入 external；ensureSkillsEnabled 把 false→true。
- [x] **Step 2:** 红灯。
- [x] **Step 3:** 实现编排；探包可注入；description 优先入参/探包结果。
- [x] **Step 4:** 绿灯。

### Task 3: 管理 API 代理与登记/安装

**Files:**
- Modify: `src/core/manager-server.ts`
- Test: `test/core-manager-server.test.ts`（扩展）

**Interfaces:**
- `GET /api/catalog/remote/leaderboard?view=&page=`
- `GET /api/catalog/remote/search?q=&limit=`
- `POST /api/catalog/remote/add` JSON
- `POST /api/catalog/remote/add-install` NDJSON（先 register+enable，再 installCatalogSkills；失败不回滚登记）

- [x] **Step 1:** 测 leaderboard/search 代理（mock fetch）；add 写入配置表；add-install 安装失败时配置表仍有记录（mock install/prepare）。
- [x] **Step 2–4:** 红→实现→绿。

### Task 4: `/catalog` UI 面板

**Files:**
- Modify: `src/ui/catalog-page.ts`
- Modify: `src/ui/manager-chrome.ts`（样式必要时）

**Interfaces:** 消费 Task 3 API；上方面板三 tab + 搜索 + 多选 + 加入/加入并安装对话框。

- [x] **Step 1:** 无单测则手工验收清单；改样式保持现有 chrome。
- [x] **Step 2:** 实现面板与对话框（Workspace/target/mode）。
- [x] **Step 3:** `pnpm test` 全绿；`pnpm build` 通过。

---

执行方式：Native（用户「开工」）。不在任务间暂停询问。未要求不 commit。
