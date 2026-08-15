# 订单履约浏览器 E2E / Smoke 运行记录

## 环境

- Docker Compose：`postgres`、`redis`、`api`、`web` 均为 healthy。
- Web：`http://localhost:3000`。
- Smoke 测试账号：本地 seed 的 `xiaoming`（仅限本地测试数据库）。
- 完整履约 E2E 账号：`dianzhang`（店长）和 `shigong`（施工人员）；runner 会在测试数据库内临时重置这两个账号密码。
- 执行日期：2026-08-15（本地 Docker runner、Chrome 页面复核与 fixture 清理回归均已重跑；本轮最新 fixture `E2E-1786772936517`）。
- 浏览器：Chrome executable + Playwright（headless）。

## 已执行路径

| 路径 | 验证内容 | 结果 |
|---|---|---|
| `/auth` | 登录表单、登录成功通知、跳转首页 | 通过 |
| `/orders` | 订单列表、批量履约查询区域渲染，无应用错误 | 通过 |
| `/orders/create` | 创建订单入口、草稿按钮、建议价区域渲染 | 通过 |
| `/construction/tasks` | 施工任务页、权威状态/操作区域渲染 | 通过 |
| `/construction/offline` | 离线队列、暂停/同步操作、清理说明渲染 | 通过 |
| `/construction/cross-store` | 跨店施工协作规则和任务区域渲染 | 通过 |
| `/orders/historical-verification` | 历史核验列表、搜索与关闭入口渲染 | 通过 |

每个页面均检查最终 URL、可见标题/关键控件和 `Application error` 缺失。登录流程实际提交本地测试账号，未向外部站点发送数据。

## 完整订单履约 E2E

可重复运行的 Docker fixture runner：

```powershell
$env:CI = "true"
pnpm test:e2e:order-lifecycle
```

runner 在本地 PostgreSQL 中复制一笔带商品和金额事实的 `PENDING_DISPATCH` 订单，完成以下真实页面操作并在数据库中核对结果：

1. 店长在 `/construction/assignments` 选择 `shigong` 并确认派单。
2. 施工人员在 `/construction/tasks/:orderId` 上传 BEFORE/膜箱照片、开始施工、上传 AFTER 照片并提交完工。
3. 店长在 `/construction/orders/:orderId` 选择“通过”并保存质检。
4. 店长在 `/orders/:orderId` 确认最终交付。

验证结果：命令 HTTP 响应均为成功；施工记录进入 `COMPLETED`；最终交付后订单为 `COMPLETED`、质保为 `ACTIVE`；最新运行订单 `E2E-1786772936517` 在 runner 结束后数据库复核为订单/审计残留 `0|0`。清理逻辑按受限外键顺序在事务中删除并对残留强断言，清理失败会使 E2E 失败，不再静默吞错。施工完工阶段订单仍保持 `IN_CONSTRUCTION`，这是待质检边界，不是失败。

带尾斜杠的 `MALLBAY_WEB_URL=http://localhost:3000/` 也已通过同一 runner；脚本会先规范化 URL，再执行登录、页面导航和履约命令。

## 发布门禁边界

本地 smoke、1440/1024/390 响应式矩阵和完整履约 E2E 均已通过，但它们不能替代预发发布门禁。预发仍需执行同一矩阵、崩溃点/回滚故障注入、真实并发扩展、迁移预检、备份恢复和 CI 浏览器 runner 验证。

`.github/workflows/deploy.yml` 已提供测试分支可选的 `browser-e2e-test` job。测试环境必须显式设置 `MALLBAY_BROWSER_E2E_ENABLED=true`，并提供受限的 `MALLBAY_E2E_WEB_URL` 与 `MALLBAY_E2E_DATABASE_URL` secrets；job 会安装 bundled Chromium，避免依赖 CI 主机预装 Chrome。`main` 发布还会先通过 `deploy-test` 部署当前候选版本，再由 `production-preprod-browser-gate` 强制执行 Prisma 生成、数据库预检、历史履约 gate、真实订单履约并发/故障 fixture 和完整浏览器 E2E；任一配置缺失或失败都不会进入生产部署。未配置开关时不能把未执行误报为通过。

## 重复执行

1. `docker compose up -d postgres redis`。
2. 在 `apps/api` 执行迁移、seed 和数据库不变量预检。
3. `docker compose up -d api web`，确认 `docker compose ps` 全部 healthy。
4. 使用浏览器连接执行上表路径，逐页检查标题、关键控件、URL 和控制台错误。
5. 运行 `pnpm test:e2e:order-lifecycle`；需要 API 请求明细时设置 `$env:E2E_VERBOSE = "1"`。
