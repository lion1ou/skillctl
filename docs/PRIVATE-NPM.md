# lion1ou 私有 npm 统一安装

私有源（Verdaccio）：`https://npm.n.lion1ou.tech:16666/`

## 本机配置

```bash
npm config set @lion1ou:registry https://npm.n.lion1ou.tech:16666/
# 如需发布，先 npm login --registry https://npm.n.lion1ou.tech:16666/
```

## 可安装包

| 包 | 作用 |
| --- | --- |
| `@lion1ou/skill-ctl` | Skill 安装 / 管理 CLI |
| `@lion1ou/usage` | Skill 使用统计 CLI（`lion1ou usage …`） |

`lion1ou-skills` **不发 npm**，继续用私有 git 作为 skill 源：

```bash
npm install -g @lion1ou/skill-ctl @lion1ou/usage
skill-ctl init --source <lion1ou-skills 的 git URL>
lion1ou usage init
```

## 发布

```bash
# skill-ctl
cd skillctl && pnpm test && pnpm run publish:npm

# usage CLI
cd skill-usage/cli && pnpm install && pnpm test && pnpm run publish:private
```

Verdaccio 侧 `publishConfig.access` 使用 `public`（源本身已私有；`restricted` 易导致 scoped 包 PUT 404）。

`skill-usage` 服务端仍用 `scripts/publish.sh` 部署，不进 npm。

## 已知阻塞（2026-10-24）

登录 `npm whoami --registry https://npm.n.lion1ou.tech:16666/` 正常，但：

- `npm publish` → `PUT … 404 no such package available`
- 手工 `PUT` 可返回 `201 created`，紧接着 `GET` 仍 404

结论：**认证可用，本地包未落盘（storage 权限 / 挂载 / 多实例无共享盘）**。修复前无法完成第一版上架。

请在 Verdaccio 主机检查：

1. `storage` 目录对运行用户可写（Docker 常见需 `chown -R 10001:65533`）
2. `config.yaml` 中 `@lion1ou/*` 的 `publish: $authenticated`，且不要错误 proxy 掉私有 scope
3. 发布后再 `GET /@lion1ou%2fskill-ctl` 应能读到 metadata，而不是立刻 404
