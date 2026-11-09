# skills.sh 管理页接入设计

日期：2026-11-09  
状态：已批准（2026-11-09；安装失败保留登记）  
范围：skillctl 管理页 Skill 源（`/catalog`）对接 skills.sh

## 意图

在管理页浏览 skills.sh 榜单与搜索结果，把选中的外部 skill 登记进用户 skill 源，并可继续安装到已管理的 Workspace / Agent。第一版只接 skills.sh；其它站点以后再说。

## 目标

1. `/catalog` 可按 All Time / Trending (24h) / Hot 拉取榜单，并支持关键词搜索。
2. 可将远程 skill 登记为 `type: external` 写入用户源配置表，并归入既有分类。
3. 支持「仅登记」与「登记并安装」；安装复用现有 `installCatalogSkills` + `npx skills` 缓存准备。
4. 榜单数据对齐 skills.sh 首页三个 tab 的公开分页接口（免 OIDC）。

## 非目标

- 不接 SkillsMP / SkillHub / Xiaping 等其它站点。
- 不接 skills.sh 官方 `/api/v1/*`（需 Vercel OIDC）。
- 不复制 skills.sh 完整站视觉；管理页保持现有 skillctl chrome。
- 不改 CLI `add` 主流程（可复用新客户端函数，但本版以管理页交付为准）。
- 不自动创建新分类；登记时必须选择已有分类。

## 反目标

- 管理服务代理外网时不把 skills.sh HTML 当主数据源长期依赖解析。
- 不在浏览器端直连 skills.sh（CSP `connect-src 'self'`；统一由本机管理服务代理）。

## 约束

- 现有模型：单 skill 源 + `SkillRecord`（`local` | `external`）；external 的 `package` 为 `owner/repo`，安装走 cache。
- 管理页已有 token 鉴权与 `/api/skills/install` NDJSON 安装流。
- 中文介绍偏好沿用 `requireChineseDescription`；管理页若需补中文，在登记对话框提示，无法交互补写时保留原 description。

## Approaches

| 方案 | 做法 | 取舍 |
| --- | --- | --- |
| **A（选定）** | 扩展 `skills-source` + catalog API + `/catalog` UI；复用登记/安装 | 最快交付；多站点抽象留到以后 |
| B | 先做 Provider 再挂 skills.sh | 扩展性好，第一版过重 |
| C | 管理页只包 CLI | 难做一站式安装体验 |

选定 A：与「管理页搜索 / 添加 / 安装 / 三 tab」直接对齐。

## 数据源

### 榜单（首页同款，免鉴权）

```http
GET https://skills.sh/api/skills/{view}/{page}
```

- `view`：`all-time` | `trending` | `hot`
- `page`：从 `0` 起；站点客户端 pageSize≈200
- 响应：`{ skills: RemoteSkill[], hasMore?: boolean }`
- 字段：`source`、`skillId`/`name`、`installs`；all-time 可有 `weeklyInstalls`；hot 可有 `installsYesterday`、`change`

### 搜索（现有公开接口）

```http
GET https://skills.sh/api/search?q=...&limit=...
```

关键词至少 2 字符。登记前仍可用 `npx skills add <package> -l` 探包（与 CLI `add` 一致），避免只凭搜索条目缺 description。

### 登记映射

| 远程字段 | SkillRecord |
| --- | --- |
| `skillId` / `name` | `id`、`name` |
| `source`（owner/repo） | `package`；`source` = `https://github.com/{package}` |
| description（探包或搜索补全） | `description` |
| — | `type: external`，`version: '*'`，`enabled: true` |

同名已在配置表中则跳过并提示。well-known / 非 GitHub `source` 第一版：探测失败则拒绝登记并说明原因（builder 可把错误文案写清楚）。

## 管理 API（本机）

均需现有管理 token。

1. `GET /api/catalog/remote/leaderboard?view=&page=`
   - 代理 skills.sh 榜单；校验 `view`；返回规范化列表 + `hasMore` + 已登记 name 集合标记。
2. `GET /api/catalog/remote/search?q=&limit=`
   - 代理搜索；规范化同上。
3. `POST /api/catalog/remote/add`
   - body：`{ skills: [{ package, name }], categoryId }`
   - 探包补 description → `addSkillsToRegistry`；不安装。
4. `POST /api/catalog/remote/add-install`
   - body：上述 + `workspace`、`target`、`mode?`、`force?`
   - 先登记（跳过已有），再对本次涉及 skillIds 走现有安装 NDJSON 流。

超时、非 2xx、JSON 异常：返回明确错误，不写入配置表。

## UI（`/catalog`）

在现有配置表**上方**增加整宽「从 skills.sh 添加」面板（不新开主导航；下方仍为现有分类 + 配置表）。**（实现者裁定：上下分区，避免改成三栏。）**

1. Tab：All Time / Trending (24h) / Hot；默认 All Time。
2. 搜索框：≥2 字触发远程搜索；清空后回到当前 tab 榜单。
3. 列表：排名、name、package、installs；已登记标记；Hot 可显示 change。
4. 多选 → 选分类（默认侧栏当前分类，若无则第一个分类）→「加入配置表」或「加入并安装」。
5. 「加入并安装」对话框：选 Workspace、Agent target、安装模式（复用已安装页语义）；日志用现有 NDJSON 展示方式。
6. 成功后刷新本地配置表视图。

### 登记 / 安装语义（实现者裁定）

- 批量探包：先对全部条目探包；**能登记的写入，失败的在结果里列出**（非全批拒绝）。已存在名称计为跳过，不算失败。
- 「加入并安装」的安装集合 = **当前勾选的全部 skill**（含已在配置表中的，便于补装），不只新登记项。
- 若勾选项在配置表中为 `enabled: false`：本路径在安装前将其视为本次要安装（安装选择集不受 skip-disabled 静默跳过；可先把这些 id 临时当 installable，或安装前将本次选中项 `enabled` 置 true——优先「安装前对选中项置 enabled: true 并写回」以便配置与行为一致）。
- `requireChineseDescription`：登记对话框对缺中文的条目提供必填中文介绍输入；未填不可提交（对齐 CLI `add`）。

## 模块划分

- `src/core/skills-source.ts`：新增 `fetchLeaderboard` / 规范化类型；搜索保持可测的 inject `fetch`。
- `src/core/catalog-remote.ts`（新建，可选）：登记编排（探包 + 写表），供 API 与日后 CLI 复用。
- `src/core/manager-server.ts`：挂 remote 路由。
- `src/ui/catalog-page.ts`：面板与交互。
- 测试：榜单/搜索解析与错误路径；登记跳过已存在；API 契约单测（mock fetch）。

## 留给实现者

- 列表加载更多的按钮或滚动触发细节。
- NDJSON 在 catalog 页的日志 UI 样式，对齐已安装页即可。
- well-known / 非 GitHub source 的拒绝文案。
- 是否给 CLI `add` 顺带改用同一规范化类型（非必须）。
- 代理超时与 `limit` 默认值（搜索建议 20–50）。

## 已确认决策

**「加入并安装」若登记已成功、安装中途失败：保留本次新写入的配置表记录**（部分成功；用户可稍后重试安装；不做回滚）。

## 验收

1. 三 tab 首页条目与 skills.sh 对应 view 的第一页大体一致（允许短暂缓存差）。
2. 搜索可找到已知 skill；加入配置表后出现 `external` 记录。
3. 「加入并安装」后目标 Workspace/Agent 下出现该 skill；cache 中有准备结果。
4. 无 token / skills.sh 失败时管理页有错误提示，不损坏本地配置表。
5. 现有 catalog 编辑、本地 sync、已安装页安装路径回归通过。
