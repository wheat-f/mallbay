# MallBay 订单履约闭环唯一写入 seam 需求评审报告

## 1. 评审信息

| 项目 | 内容 |
|---|---|
| 被评审文档 | `docs/features/order-lifecycle-single-write-seam-prd.md` V1.48 |
| 评审日期 | 2026-08-15 |
| 评审范围 | 目标、范围、流程、状态、权限、数据、原子性、幂等、并发、页面操作、异常恢复、迁移、可观测性、验收与追溯 |
| 评审方法 | `requirement-review` 全量评审 + 页面交互专项复评；发现阻断项即回写 PRD，再重新评审 |
| 最终结论 | **代码实施评审通过，可进入预发验证；生产发布门禁待真实环境执行** |

## 2. 最终结论摘要

| 严重度 | 未关闭数量 | 结论 |
|---|---:|---|
| S0 | 0 | 无业务事实错误、资金/库存/订单重复或越权风险未定义 |
| S1 | 0 | 无阻塞开发、联调、测试或发布门禁的规则缺口 |
| S2 | 3 | 均为执行期负责人、阈值和日期，不改变业务规则，不阻塞进入研发 |
| S3 | 0 | 无仅体验层建议 |

通过理由：

1. external interface、内部 implementation 和事实所有权边界已明确，唯一写入 seam 不再依赖 optional、fallback 或运行期注册。
2. 创建、报价转单、施工、质检、最终交付、取消、回退和跨店命令均具备事务、幂等、版本并发和新旧命令语义。
3. 命令记录、版本变更账本、历史核验单和施工证据去重记录的创建、唯一约束、权限与失败规则已明确。
4. Web、施工 Web 与兼容 adapter 的输入、错误、重放、权限展示、草稿保护和禁止推断规则已明确；小程序按 PRD 4.3 延期，不作为本轮实现门禁。
5. 页面正常路径不暴露技术字段；高风险确认、未知结果恢复、移动端阻塞说明、离线混合结果和历史核验均有明确交互与验收。
6. AC-01 至 AC-35 与需求—验收追溯矩阵覆盖本期 API/Web 业务规则；小程序相关条款按 PRD 4.3 标记延期，发布门禁包含真实 PostgreSQL 并发、故障注入、页面 E2E、迁移预检和删除测试。

## 2.1 V1.4 实施复核结果

本轮按 replace-don’t-layer 复核了生产代码路径、页面 adapter、schema/migration 和契约测试：

| 检查项 | 结果 | 证据 |
|---|---|---|
| 唯一写入 seam | 通过 | `OrderLifecycle` 依赖必需化；删除 runtime handler、fallback 与 `CreateOrderUseCase` 外部导出；订单、施工、跨店命令统一经 seam |
| 原子性与版本 | 通过 | 报价转单同事务；完工副作用入事务；最终交付条件抢占版本；历史核验关闭递增版本；跨店订单/任务双版本条件更新 |
| 页面权威能力 | 通过 | 订单列表批量阶段、订单详情终交/取消/回退、施工任务、跨店逐行按钮均消费 `{visible, enabled, blockingReasonCodes}` 和版本；失败行提供重试 |
| 草稿/命令恢复 | 通过 | 创建草稿 actor/store 隔离与 submission lease；创建/报价/履约页面复用稳定命令 ID，结果未知时保留原意图 |
| 证据与离线去重 | 通过 | 服务端 `EVIDENCE_STAGE_NOT_ALLOWED` 门禁；`ConstructionPhoto.clientOperationId` 唯一约束和重放返回；离线清理需确认且明确不撤销服务端事实 |
| 历史核验闭环 | 通过 | 新增 `/orders/historical-verification` 页面，展示问题码/责任处理提示并以版本命令关闭核验单；订单详情提供入口 |
| 代码门禁 | 通过 | API/Web/Shared TypeScript 检查通过；订单履约相关生命周期、工作流、深模块、施工、报价、字典治理契约测试通过；运行期对账专项 2/2、页面事件专项 2/2，API 全量真实 PostgreSQL 测试 439/439/0/0；Web 全量 621/621；深模块契约 12/12；离线/施工 API 专项 8/8、OSS/施工证据专项 11/11 通过；小程序按 PRD 4.3 延期，不纳入本轮门禁 |
| 企业统一收款版本失效 | 通过 | `CustomerSettlementsService.createReceipt` 在每个订单分摊的金额更新同一事务内条件递增 `lifecycleVersion`，写入 `CASH` 来源账本；新增结算服务契约测试通过，覆盖现金分摊与 `N → N+1` 记录 |
| 真实 PostgreSQL 并发/迁移预检 | 通过（Docker） | `docker-compose.yml` 启动 PostgreSQL/Redis；源码 73 个 migration 目录已纳入空库门禁；新增施工证据迁移已在本地真实库应用；数据库不变量预检通过；真实幂等/容量并发测试 2/2 通过 |
| 订单履约专用 PostgreSQL 并发 | 通过（Docker） | 使用 `MALLBAY_RUN_REAL_DB_TESTS=1 DATABASE_URL=... pnpm --filter @mallbay/api exec tsx --tsconfig tsconfig.app.json --test src/prisma/order-lifecycle-concurrency.test.ts`；真实 PostgreSQL 验证不同命令竞争矩阵、已批准报价认领、普通下单同命令并发去重/输入漂移、订单事实/命令记录/版本账本原子回滚、真实 `OrderLifecycle.createOrder`、报价转单后置关联、施工命令和首次定金现金事实故障注入，fixture 9/9 通过 |
| 历史履约数据门禁 | 通过（Docker） | `pnpm --filter @mallbay/api db:historical-gate` 检查终态事实、核验单覆盖和版本账本孤儿引用；本地真实库与空库同构流程均通过，gate 只读且不会自动修复 |
| CI 空数据库履约门禁 | 通过（配置并本地复现） | `.github/workflows/deploy.yml` 的 `real-db-stage-gate` 在空 PostgreSQL 上执行 73 个迁移、预检、历史 gate 和自举 fixture；本地同构流程 9/9 通过，测试不会因缺少预置数据而 skipped |
| CI 浏览器履约门禁 | 配置完成，待测试环境启用 | `browser-e2e-test` 安装 bundled Chromium 并复用 `pnpm test:e2e:order-lifecycle`；需要测试环境显式开启变量和受限 Web/DB secrets，当前仅本地 Docker/Chrome 已执行 |
| main 生产发布前预发门禁 | 已接入，待真实环境执行 | main 先通过 `deploy-test` 部署当前候选 commit，再由 `production-preprod-browser-gate` fail-closed 执行 Prisma client 生成、数据库不变量预检、历史履约 gate、订单履约专用 PostgreSQL 并发/故障注入 fixture 和完整浏览器 E2E；`deploy-production` 显式依赖该 job，未配置或失败不会部署 |
| 页面浏览器 smoke | 通过（Chrome） | `docs/features/order-lifecycle-browser-e2e.md`；已验证登录、订单列表、创建订单、施工任务、离线同步、跨店协作、历史核验 7 条路径且无应用错误 |
| 当前会话页面验收 | 通过（Chrome，只读） | 本轮实际打开 `/orders`、`/construction/assignments`、`/orders/create`；三页均有 `main` 与全局搜索，订单列表的新建订单入口可导航到创建页，客户字段保持必填；未提交任何写操作 |
| 备份恢复演练 | 通过（Docker） | `apps/api/scripts/backup-restore-rehearsal.ps1` 导出、复制到容器、恢复到临时库，严格错误模式校验源码对应的 73 条唯一且已完成迁移记录、无失败/未完成记录、履约新表（含证据指纹/状态）和订单数据后清理；新增迁移已在源码目录并由空库 CI 门禁覆盖 |
| 完整订单生命周期浏览器 E2E | 通过（本地 Docker） | `pnpm test:e2e:order-lifecycle`；Playwright 使用 Docker Web/API 与真实 PostgreSQL fixture，覆盖 1440/1024/390 响应式 smoke、店长派工、施工人员证据/开工/完工、店长质检和最终交付；订单最终 `COMPLETED`、质保 `ACTIVE`，fixture 自动清理 |
| fixture 清理可靠性 | 通过（本地 Docker） | 修复终交付后 `Warranty` 等 `RESTRICT` 外键导致父订单删除失败且被静默吞掉的问题；清理事务按依赖顺序删除并强断言残留，最新订单 `E2E-1786731217852` 复核订单/审计残留为 `0|0` |
| API 启动历史门禁回归 | 通过（本地 Docker） | API entrypoint 增加数据库不变量预检与历史履约 gate 后，复跑 `pnpm test:e2e:order-lifecycle` 返回 `{"ok":true}`；URL 规范化后再次通过，订单 `E2E-1786726537933`、`E2E-1786726929993` 均已清理 |

代码实施评审不再发现 S0/S1 业务规则缺口；Docker 数据库迁移/预检、订单履约专用并发矩阵、命令占位、真实 `OrderLifecycle.createOrder` 回滚、报价转单后置关联回滚、施工命令回滚、首次定金现金事实回滚、历史数据 gate、备份恢复、Chrome 页面 smoke、本地响应式矩阵、本地完整生命周期浏览器 E2E，以及 API 全量单元测试均已通过。CI 真实数据库与浏览器 job 已配置并完成本地同构复现，但仍需在真实预发环境重放故障注入、响应式矩阵、扩展并发、CI 浏览器 runner 和历史数据门禁；在这些门禁通过前不得恢复生产维护窗口。

### 2.2 V1.15 复评结果

本轮针对实现补齐项和页面契约重新评审，结果为通过：

| 检查项 | 结果 | 证据 |
|---|---|---|
| 证据与离线命令幂等 | 通过 | `ConstructionPhoto.clientOperationId`、`LeaveRequest.clientOperationId` 唯一持久化；OSS 对象键使用稳定命令标识；同命令重放返回既有事实，输入变化返回冲突 |
| 质检重复 PASS | 通过 | 已完成且已 PASS 的施工记录拒绝无新完工事实的再次 PASS；返工后重新完工仍可进入新一轮质检 |
| 历史核验查看权限 | 通过 | 新增 `verification_view` action；查看与关闭权限分离，订单详情和核验页仅消费对应权威 capability |
| 页面失败态与权威读取 | 通过 | 订单详情/列表、施工任务列表/详情不再以原始订单状态回退履约阶段；权威查询失败时显示可恢复阻塞和重试入口 |
| Web 测试门禁 | 通过 | 设置页切换统一治理 API 并增加页面 seam contract 后，Web 全量 619/619 通过；API 全量 429/418/0/11 通过 |
| Docker 发布前证据 | 通过 | 真实 PostgreSQL 履约 fixture 9/9、预检、历史 gate、备份恢复、完整浏览器 E2E 均复跑通过；E2E 订单/审计残留 `0|0` |

本轮没有新增 S0/S1；Provenance/SBOM workflow 静态检查仍为 0 个覆盖项，保持构建证明开启。真实 CI/预发环境仍是最终发布门禁，不以本地 Docker 复现替代。

### 2.3 V1.16 证据幂等复评

施工证据记录现在同时持久化操作者、工单目标、证据阶段、请求指纹和 `APPLIED/REVOKED` 状态；同一命令标识输入变化或跨操作者重放返回 `COMMAND_ID_CONFLICT`，已撤销证据返回稳定 `EVIDENCE_REVOKED`。页面与 transport adapter 只返回业务安全字段，不暴露指纹和命令实现字段。相关施工、离线同步、schema contract、API 422/411/0/11、Web 617/617 与 TypeScript 检查均通过，评审保持通过。

同轮补齐 AC-16 的进程日志故障边界：`AuditEventWriter.writeTransactional` 先持久化事务内审计事实，日志 sink 失败时仅返回 `processLogAccepted=false`，不再让日志异常回滚业务事务；`domain-module-contracts.test.ts` 已验证事实仍被写入且调用结果保持 accepted。

### 2.4 V1.17 收款幂等复评

订单收款的显式幂等键现在绑定账户、支付类型、金额、支付时间和操作者；同键不同输入返回 `COMMAND_ID_CONFLICT`，并发撞 `OrderPayment(orderId, idempotencyKey)` 唯一约束时在事务回滚后重新读取并按同一规则重放，不再把原始 P2002 交给页面。订单服务 25/25、API 全量 422/411/0/11、Web 全量 617/617 与 API/Web TypeScript 检查均通过，评审保持通过。

同时删除独立质保生成服务、API 和页面路由；质保工作台只展示待最终交付订单并导航至订单详情，质保仍由 `FINAL_DELIVERY` 同事务形成/激活，避免新的平行写入 seam。

### 2.5 V1.18 Docker 最终门禁复评

本轮发现浏览器最初命中旧 API 镜像，订单详情仍返回旧 `workflow` 字段，导致页面停留在“履约状态加载中”；重建并重启 API 镜像后，接口返回权威 `lifecycle` 快照，问题关闭。随后复跑结果如下：

| 检查项 | 结果 | 证据 |
|---|---|---|
| 完整订单履约浏览器 E2E | 通过（本地 Docker/Chrome） | 店长派工 → 施工证据/开工/完工 → 店长质检 → 最终交付；最新 fixture `E2E-1786740031531` 订单 `COMPLETED`、质保 `ACTIVE`，清理残留 `0|0` |
| 备份恢复演练 | 通过（Docker） | 导出并恢复到临时 PostgreSQL，校验 73 条迁移、`OrderLifecycleCommandRecord`、`ConstructionPhoto`、`ConstructionEvidenceStatus`、指纹/状态字段与订单数据，完成临时库清理 |
| 构建证明 | 条件通过 | API/Web Docker build 在本地可完成；ACR 实测拒绝 BuildKit SBOM 的 OCI empty manifest，因此 workflow 三个构建 job 显式使用 `provenance:false`、`sbom:false`；待 registry 支持该 artifact class 后恢复证明并补验 |
| 回归测试 | 通过 | API 424/413/0/11、Web 617/617、API/Web TypeScript 全部通过 |

本轮没有新增 S0/S1；评审结论保持通过。真实 CI runner、预发数据门禁和预发浏览器仍是生产发布前必须执行的外部环境门禁，不能以本地 Docker 结果替代。

### 2.14 V1.36 本地门禁复跑

在当前 Docker 服务健康的条件下重新执行 API 全量真实 PostgreSQL 测试（430/430/0/0）、数据库不变量预检、历史履约门禁、Web 全量测试（619/619）及 API/Web/Shared TypeScript 检查，全部通过；完整 Chrome/Playwright 履约 E2E 以 fixture `E2E-1786766412670` 通过并完成清理。为避免 pnpm virtual-store 布局导致测试入口误报，Web runner 现在按本地、virtual-store、根 node_modules 顺序定位 tsx CLI；Shared 包恢复统一的离线同步状态与稳定错误码类型契约，且 CI verify 已显式执行 Shared typecheck。该轮没有新增 S0/S1，代码实施评审保持通过；真实 CI runner、预发数据/并发/故障注入、预发浏览器矩阵仍是生产发布前门禁，小程序继续按 PRD 4.3 延期。

### 2.15 V1.37 调用来源 contract 复评

订单 Web、施工 Web 与跨店履约 transport 现在必须向 `OrderLifecycle.transition` 提供明确 `source`，并在命令记录 `inputSummary.caller` 中持久化；调用来源不再依赖兼容默认值。生命周期专项 8/8、深模块 contract 12/12、API TypeScript 检查通过。该变化只收紧既有唯一 seam 的调用上下文，不改变命令集合、事实所有权或事务边界；评审保持通过。真实 CI/预发门禁与小程序延期范围不变。

### 2.7 V1.20 AC-01 真实并发复评

新增真实 PostgreSQL fixture 同时提交两个相同 `CREATE_ORDER` 命令，断言两次返回同一订单，数据库只有一组明细、一笔 `OrderPayment`、一笔 `ORDER_PAYMENT` 现金账本、一条命令记录和一条 `lifecycleVersion` 变化；随后使用同一命令标识改变输入，断言返回 `COMMAND_ID_CONFLICT` 且不产生第二订单。完整订单履约 fixture 由 8/8 增至 9/9，评审保持通过。

### 2.8 V1.21 ConstructionFulfillment seam 收窄复评

`ConstructionFulfillment` 已删除派工列表、证据上传、质检历史、材料操作和离线同步等纯 pass-through 方法；controller transport adapter 直接映射到 `ConstructionService`，履约 view、能力派生、生命周期命令和跨店命令仍统一经过 fulfillment seam。新增深模块契约断言该 façade 不再镜像下层 implementation，API 全量 421/410/0/11 与相关 17 项契约测试通过，评审保持通过。

### 2.9 V1.22 Order Intake 结构化错误复评

`PricingService` 现在对成本不完整、定价阻塞和报价审批要求返回稳定错误码；创建页按 `QUOTE_APPROVAL_REQUIRED` 进入报价提交分支并保留原草稿，不再依赖中文 message 文案。PricingService 6/6、API 全量 422/411/0/11、API/Web TypeScript 与既有 Web 617/617 均通过，评审保持通过。

### 2.10 V1.24 Dictionary Governance seam 复评

新增 `DictionaryGovernanceService/Controller` 作为统一外部接口：服务端完成 STORE 与 HQ_TEMPLATE 的跨来源稳定排序、全局分页、条目读取、导入预览/提交及创建/编辑/启停/删除命令路由；两种来源仅作为内部 adapter。设置页现在只消费 `dictionaryGovernanceApi`，不再在浏览器端学习两套 API、合并分页或按 `kind` 分支调用。治理契约 2/2、设置相关 API 16/16、页面 seam 契约 2/2、Web 619/619、字典页面只读 Chrome smoke、API/Web Docker 构建与完整 Chrome E2E 均通过，评审保持通过。

### 2.11 V1.25 Prisma schema 一致性复评

复跑完整门禁时发现 `SalesReturnDetail` 的既有迁移和服务写入已经使用 `verifiedUnitCostCents`，但 Prisma schema 漏声明该列，导致 API 类型检查失败。已补齐 schema 字段并重新生成 Prisma Client；API 类型检查、Web TypeScript 6 类型检查、API 全量 425/414/0/11、Web 全量 619/619、真实 PostgreSQL 履约 fixture 9/9、Docker 备份恢复与完整 Chrome E2E 均通过。该问题与构建 Provenance/SBOM 无关，保持两项证明开启，评审保持通过。

### 2.12 V1.26 唯一写入 seam 回归契约复评

新增深模块契约，直接读取 Nest metadata 断言 `OrdersModule` 只导出 `OrderLifecycle` 作为订单履约写入 seam，而不导出内部 `CreateOrderUseCase`。该契约 11/11 通过，API 全量 425/414/0/11、Web 619/619 与 TypeScript 检查保持通过，评审保持通过。

### 2.13 V1.27 必需依赖复评

清除 `OrderLifecycle` 内部对 `AccessContext` 与 `CreateOrderUseCase` 的非空回退断言，并将类注释明确为所有订单履约写入与权威读取的必需应用 seam。该变更不增加第二条路径；深模块契约 11/11、API TypeScript 检查通过，评审保持通过。构建 Provenance/SBOM 仍保持开启。

### 2.14 V1.28 离线同步结果复评

离线同步不再返回笼统的 `SYNCED/FAILED`：服务端按命令重放、版本/输入冲突、可重试系统失败和稳定业务拒绝分别返回 `REPLAYED/CONFLICT/RETRYABLE_FAILURE/REJECTED`，成功新事实返回 `APPLIED`，并保留稳定错误码。Web 队列只自动重试 `RETRYABLE_FAILURE`，`CONFLICT/REJECTED` 留在摘要中等待用户处理，`APPLIED/REPLAYED` 从待处理队列移除。离线同步 API/服务测试 3/3、施工相关 Web 测试 87/87、API/Web TypeScript 检查通过，评审保持通过。

### 2.15 V1.29 证据 transport 字段复评

施工照片新建与重放结果统一经过安全序列化；调用端仍可获得证据 ID、工单、阶段、地址、上传人、采集时间和状态，但不会获得 `clientOperationId` 或 `requestFingerprint`。施工证据/离线相关 API 测试 8/8、API 全量 426/415/0/11、Web 全量 619/619、API/Web TypeScript 检查通过；API/Web Docker 镜像重建后完整订单履约浏览器 E2E 再次通过，评审保持通过。

### 2.16 V1.30 AC-17 生产源码边界复评

新增深模块契约递归扫描 `apps/api/src` 生产源码（排除测试文件），除 `OrderLifecycle`、其内部 `CreateOrderUseCase` implementation 和模块装配点外，任何文件引用 `CreateOrderUseCase` 均失败；同时扫描并禁止 `OrderLifecycle` optional fallback 与 `registerConstructionHandler` runtime 注册重新出现。该契约 12/12 通过，API 全量 429/418/0/11、Web 全量 619/619、API/Web TypeScript 检查及 Docker 订单履约浏览器 E2E（fixture `E2E-1786760397144`）保持通过，评审保持通过。

### 2.17 V1.31 离线页面结果可辨识性复评

发现服务端已返回稳定 `code`，但 Web 离线页在 `mergeSyncResult` 时未保留该字段，且新五态没有完整 CSS 映射，用户无法区分版本冲突、业务拒绝与可重试失败。现已将 `code` 持久化到队列并在桌面表格/移动卡片展示，为 `APPLIED/REPLAYED/CONFLICT/RETRYABLE_FAILURE/REJECTED` 补齐状态样式与源码契约。离线/施工 API 专项 8/8、Web 全量 619/619、Web TypeScript 检查、Web Docker 重建和完整订单履约浏览器 E2E（fixture `E2E-1786758874610`）通过，评审保持通过。

### 2.18 V1.32 施工证据对象生命周期复评

发现上传文件在数据库事实提交前写入 OSS，数据库失败会留下孤儿对象。现已在 `OssService` 增加 provider/host 限定的施工对象删除，并在证据写入失败时清理本次新上传；唯一键冲突后读取既有证据时跳过删除，避免误删已提交对象。OSS/施工证据专项 11/11、API 全量 429/418/0/11、API TypeScript 检查通过，评审保持通过。

### 2.19 V1.33 离线同步结果与冲突恢复复评

离线页现保留本次同步摘要，按成功、已重放、需处理、可重试逐项展示结果；`CONFLICT` 项提供“查看最新任务”入口，用户必须先查看最新权威任务再以新命令 ID 发起业务动作；清理队列或摘要均二次确认并明确不会撤销服务端事实。Web 全量 619/619、Web TypeScript、Web Docker 生产构建和完整 Chrome E2E（fixture `E2E-1786761114209`）通过，评审保持通过。

### 2.20 V1.34 真实 PostgreSQL 门禁复评

本轮以 Docker PostgreSQL 开启 `MALLBAY_RUN_REAL_DB_TESTS=1` 执行 API 全量测试，429/429/0/0；订单履约并发/故障 fixture 9/9 通过。数据库不变量预检、历史履约数据门禁、备份恢复演练和 workflow YAML 解析均通过；最新 Chrome 响应式矩阵与完整履约 E2E fixture `E2E-1786762280422` 通过并清理残留；Provenance/SBOM 未关闭。真实 CI runner、预发 secrets/data 和预发浏览器复跑仍是发布阶段门禁，评审结论保持“代码实施通过、生产发布未通过”。

### 2.21 V1.35 小程序范围延期复评

按用户当前交付优先级，本轮将小程序真机联调、页面迁移和专用 E2E 延期；小程序保留现有兼容 adapter，不改变 API/Web 唯一写入 seam。PRD 4.3 已明确延期边界，API/Web 实施与本地门禁不受影响；后续重新纳入时必须单独补齐小程序门禁并重新评审 AC-14/AC-18。评审保持通过，但本轮结论仅适用于 API/Web 订单履约闭环。

### 2.6 V1.19 CI 发布门禁复评

新增的 CI 备份恢复步骤使用空 PostgreSQL job 的独立临时数据库，不触碰预发业务库；恢复后严格校验源码迁移目录数量、履约命令表、施工照片表和 `ConstructionEvidenceStatus` enum，并通过 `trap` 清理临时库与 dump。首轮 CI 暴露 runner 自带 PostgreSQL 16 client 与 PostgreSQL 17 service 的版本差异，已改为在 `postgres:17-alpine` client container 中执行 pg_dump/pg_restore。镜像构建随后暴露 ACR 不接受 BuildKit SBOM OCI empty manifest，故三个构建 job 显式设置 `provenance: false`、`sbom: false`；这不是业务门禁放宽，而是 registry 兼容性修复，待 registry 支持后必须恢复证明并复验。

## 3. 评审迭代记录

### 3.1 第一轮：原子性、幂等与版本模型

| ID | 初始严重度 | 问题证据 | 业务/研发影响 | 整改结果 | 责任角色 | 阻塞状态 |
|---|---:|---|---|---|---|---|
| R1-01 | S0 | 创建命令的命令记录要求 `orderId` 必填，但幂等键必须在订单生成前占用 | 并发普通下单可能创建两个订单，无法实现 AC-01 | `orderId` 改为创建期可空；事务第一步以 `storeId + commandId` 占位，创建成功同事务回填；增加请求指纹冲突规则 | API 订单领域研发 | 已关闭 |
| R1-02 | S1 | `PROCESSING/FAILED` 持久化状态与“系统失败整体回滚、同 ID 可重试”冲突 | 崩溃恢复无法确定重放还是重复执行 | 仅持久化 `SUCCEEDED/REJECTED`；系统失败回滚占位和业务事实；并发由数据库唯一约束串行化 | API 订单领域研发 | 已关闭 |
| R1-03 | S1 | 库存、现金等外部事实会改变履约版本，但没有统一可追溯记录 | 无法证明事实与版本同事务，监控口径错误 | 新增 `OrderLifecycleVersionChange`；每个改变权威结果的业务事务恰好 `N → N+1`，来源键去重，同事务写账本 | API 架构、库存/财务 owner | 已关闭 |
| R1-04 | S1 | 已派工且材料已领取时既有派生逻辑会回落到待派工，开工来源阶段不明确 | 页面、接口和测试会出现两套解释 | 增加非持久化派生阶段 `READY_TO_START`；无锁定物料或已全部领取时可开工 | API 订单/施工研发 | 已关闭 |
| R1-05 | S0 | 兼容 adapter 为缺少命令 ID 的普通下单生成请求级 ID，网络重试仍会重复建单 | 违背唯一写入和创建幂等目标 | `CREATE_ORDER`、`CONVERT_QUOTE_TO_ORDER` 必须提供稳定 `Idempotency-Key`；缺失返回 `COMMAND_ID_REQUIRED`；兼容仅覆盖非创建命令 | API transport、Web/小程序研发 | 已关闭 |

### 3.2 第二轮：可判别结果、权限与状态流

| ID | 初始严重度 | 问题证据 | 业务/研发影响 | 整改结果 | 责任角色 | 阻塞状态 |
|---|---:|---|---|---|---|---|
| R2-01 | S1 | “成功命令递增版本”与“不同新 ID 但目标已完成时不重复写”相互冲突 | final delivery、cancel 等重试实现会各自解释 | 定义 `APPLIED`、`ALREADY_SATISFIED`、`REPLAYED`、`REJECTED`；仅 `APPLIED` 递增版本；逐命令定义已满足语义 | API 订单领域研发 | 已关闭 |
| R2-02 | S1 | 角色描述未明确 capability、scope 与 owner bypass 的组合；封版核验还发现 legacy 权限表不给门店店长 `store:write` | 执行门店可能越权最终交付，或按宽泛 capability 实现后错误禁止店长；施工人员可能操作他人工单 | 增加 `orders.lifecycle` 细粒度 finalize/cancel/cross-store-source/verification-resolve actions、默认门店店长/HQ 绑定与缓存发布门禁；施工 owner bypass 仅本人 assignment | 权限与订单领域研发 | 已关闭 |
| R2-03 | S1 | 跨店命令只有概括描述，没有明确允许来源状态和双版本更新 | 无法编写并发 contract，订单和跨店任务可能部分成功 | 明确五类跨店命令、状态、门店权限；订单版本与任务版本同事务条件递增，任一失败整体回滚 | API 施工/订单研发 | 已关闭 |
| R2-04 | S1 | 相同命令 ID 但业务输入变化时只按 ID 重放 | 调用端可能认为新输入已生效，实际返回旧结果 | 增加规范化 `requestFingerprint`；同 ID 不同输入返回 `COMMAND_ID_CONFLICT` | API 订单领域研发 | 已关闭 |
| R2-05 | S1 | 业务拒绝与权限拒绝都可能持久化命令结果 | 越权用户可抢占命令 ID或探测目标 | `FORBIDDEN` 与不可见资源在占位前返回；稳定业务拒绝在权限通过后才持久化 | API 权限/订单研发 | 已关闭 |

### 3.3 最终轮：一致性读取、历史治理与可验收性

| ID | 初始严重度 | 问题证据 | 业务/研发影响 | 整改结果 | 责任角色 | 阻塞状态 |
|---|---:|---|---|---|---|---|
| R3-01 | S1 | “同一数据库快照”未规定实现方式；PostgreSQL 默认 `READ COMMITTED` 多查询可混入新提交 | 权威结果可能组合不同版本事实 | 规定单条一致性查询或 `REPEATABLE READ` 只读事务；命令响应携带写事务 `afterVersion` | API 订单领域研发 | 已关闭 |
| R3-02 | S1 | 历史矛盾仅有临时清单，没有持久对象、权限和恢复写入门禁 | 非终态异常订单可能上线后无法处置或静默推进 | 新增 `OrderLifecycleVerificationCase`，定义稳定问题码、唯一 OPEN、纠正与关闭权限；未建单异常为 0 才恢复写入 | API 订单领域、数据迁移 owner | 已关闭 |
| R3-03 | S1 | 新命令 ID 到达已满足目标时未逐命令定义 | 派工人员、施工时间、质检证据等可能被静默忽略 | 对创建、转单、派工、开工、完工、质检、终交、取消、回退和跨店逐项定义 `ALREADY_SATISFIED`/拒绝/核验 | 产品、API 订单/施工研发 | 已关闭 |
| R3-04 | S1 | 离线照片去重只有原则，没有记录、对象键和验收 | DB 失败重试可能留下多个对象或多个证据事实 | 定义施工证据去重记录、请求指纹、稳定对象键和清理策略；补 AC-20 | API 施工、小程序研发 | 已关闭 |
| R3-05 | S1 | 跨店和离线流程没有独立 Given/When/Then，需求与测试不可一一追溯 | 测试可能只覆盖 happy path | 新增 AC-19、AC-20 和需求—验收追溯矩阵 | 测试负责人 | 已关闭 |

### 3.4 页面专项轮：入口、字段、能力与反馈

| ID | 初始严重度 | 问题证据 | 业务/研发影响 | 整改结果 | 责任角色 | 阻塞状态 |
|---|---:|---|---|---|---|---|
| R4-01 | S1 | 创建页靠中文错误文案判断“需报价审批”，且报价创建本身无稳定幂等键 | 文案变更会断流；网络超时可能重复创建报价和审批记录 | 增加 `QUOTE_APPROVAL_REQUIRED`；普通下单保持自动转报价，报价创建增加稳定幂等字段和唯一约束 | API 定价/报价、Web 研发 | 已关闭 |
| R4-02 | S1 | 页面仅有布尔能力概念，无法区分无权限与业务阻塞；跨店按钮按 tab/status 推断 | 越权入口可能泄露，或有权用户看不到阻塞原因 | 能力统一为 `{ visible, enabled, blockingReasonCodes }`；拆分查看/关闭核验能力；跨店逐行消费权威能力 | API 查询、Web 研发 | 已关闭 |
| R4-03 | S1 | 施工任务“开始验车”实际触发正式开工，且领料前后语义不清 | 用户拍照可能误把订单推进施工中 | 验车/BEFORE 证据与 `START_CONSTRUCTION` 分离；正式按钮更名“开始施工”，物料门禁由权威能力控制 | 施工产品、API/Web 研发 | 已关闭 |
| R4-04 | S1 | 质检后端返工要求责任类型，页面只有结果和说明 | 用户提交后才失败，无法完成返工质检 | 返工场景新增 `AFTER_SALE_RESPONSIBILITY` 责任类型必填；通过场景不增加字段 | 施工产品、Web/API 研发 | 已关闭 |
| R4-05 | S1 | 订单详情缺少终交/取消/回退的统一能力与高风险影响摘要 | 页面可能继续自行推断，用户无法确认不可逆影响 | 增加权威操作入口、`actionImpactSummaries`、确认框版本失效和阻塞处理入口 | 订单产品、API/Web 研发 | 已关闭 |

### 3.5 恢复专项轮：未知结果、批量失败与离线留痕

| ID | 初始严重度 | 问题证据 | 业务/研发影响 | 整改结果 | 责任角色 | 阻塞状态 |
|---|---:|---|---|---|---|---|
| R5-01 | S0 | 创建/转单提交结果未知后，若用户修改表单并换新命令 ID，原请求可能已成功 | 可能产生第二张订单或重复报价 | 增加“结果待确认”只读状态；只能用原 ID确认/重试，原结果明确前禁止产生新意图；补 AC-33 | Web/小程序、API 订单研发 | 已关闭 |
| R5-02 | S0 | 同一草稿多标签可形成不同输入；若各自自动换新命令 ID，可能都成功创建 | 可能重复建单，也可能错误重放其他身份或其他草稿结果 | 命令状态按 actor/store/对象/类型隔离；草稿增加 revision、submission state 与原子 lease，首次发送后其他标签只能确认原结果或显式另存新草稿；补 AC-32 | Web/小程序研发 | 已关闭 |
| R5-03 | S1 | 批量权威查询若一项失败可能拖垮列表，页面可能回退旧状态 | 整页不可用或展示错误履约阶段 | 批量结果逐项可判别；失败行单独重试，禁止状态 fallback | API 查询、Web 研发 | 已关闭 |
| R5-04 | S1 | 离线成功项移除后无本次结果留痕，冲突项“放弃”语义不清 | 用户无法确认哪些已成功，可能误以为放弃会撤销服务端事实 | 增加同步摘要保留、逐项状态和放弃/清理二次确认；补 AC-28、AC-35 | 小程序/Web 研发 | 已关闭 |
| R5-05 | S1 | 页面限制施工证据阶段但服务端没有同等验收要求 | 绕过页面或离线同步可在开工前上传 DURING/AFTER | 证据 API 按权威阶段校验；开工前只接受 BEFORE；补 AC-35 | API 施工研发 | 已关闭 |

### 2.16 V1.38 可观测性 contract 复评

`OrderLifecycleObservability` 已落地为唯一 seam 的内部观测 implementation：每条 create/transition 命令记录命令类型、调用来源、是否重放、版本前后值、稳定结果码、耗时、跨店标记、回滚标记及事务内通知意图数量；同时递增命令总量、耗时、重放和回滚指标，并输出结构化日志。事务内通知意图通过 transaction-scoped wrapper 计数，不把 Prisma transaction client 暴露给 external interface。

验证结果：可观测性专项测试 1/1、生命周期专项（含可观测性）9/9、API 全量 430/430/0/0、API TypeScript 通过。该项不改变页面业务操作，不把技术字段返回给 Web 或小程序；小程序仍按 PRD 4.3 延期。

### 2.17 V1.39 Docker 发布前证据复跑

Docker API、Web、PostgreSQL 和 Redis 服务恢复健康后，重新执行完整订单履约浏览器 E2E：店长派工 → 施工证据/开工/完工 → 质检 → 最终交付，fixture `E2E-1786768973628` 返回成功并完成清理。随后执行 `apps/api/scripts/backup-restore-rehearsal.ps1`，临时库恢复严格通过 73 条迁移、`OrderLifecycleCommandRecord`、`ConstructionPhoto`、`ConstructionEvidenceStatus`、证据指纹/状态字段及订单数据校验，并删除临时库。该复跑没有新增 S0/S1，代码实施评审保持通过；真实 CI/预发门禁仍未被本地 Docker 结果替代。

### 2.18 V1.40 验收范围一致性复评

AC-18 的页面门禁现在明确只要求 Web 1440/1024/390 响应式矩阵和 Web 履约 E2E；小程序关键路径、真机联调和专用 E2E 统一按 PRD 4.3 延期，不再出现在本轮“全部通过”的验收条件中。该修订与用户确认的小程序暂不纳入范围一致，不改变 API/Web 行为或发布 fail-closed 规则；评审保持通过。

### 2.19 V1.41 回滚通知意图观测复评

命令事务通过 `notification.createMany` 写入通知意图后，如果后续施工/订单事实失败并回滚，`OrderLifecycleObservability` 现在保留已尝试的通知意图数量，同时记录 `rolledBack=true`；没有意图的命令仍记录 0，重放仍记录 `null`。新增生命周期测试验证两条意图在事务失败后仍能被观测，避免把“已尝试但回滚”误报成“没有通知”。生命周期专项 9/9、API 全量真实 PostgreSQL 测试 431/431/0/0、API TypeScript 通过，评审保持通过。

### 2.20 V1.42 指标内存边界复评

`MetricsService.recordLatency` 现在为每个指标/标签组合保留最近 1024 个延迟样本，淘汰更早样本，避免 API 长期运行后无界增长；计数器、标签规范化和命令耗时口径不变。指标专项 3/3、API 全量真实 PostgreSQL 测试 432/432/0/0、API TypeScript 通过，评审保持通过。

### 2.21 V1.43 内部指标消费边界复评

新增 `GET /internal/metrics`，仅在配置 `METRICS_TOKEN` 且请求携带匹配的 `X-Metrics-Token` 时返回指标快照；未配置或令牌错误统一返回 404，业务页面、浏览器 CORS 和小程序均不消费该端点。快照返回计数器、标签及 P50/P95/P99/最大耗时摘要，不返回客户联系方式、表单原文或照片内容。指标/端点专项 5/5、API TypeScript 通过，生产 compose 与部署指南已同步，评审保持通过。

### 2.22 V1.44 指标配置 fail-closed 复评

`docker-compose.prod.yml` 现在使用必填插值 `${METRICS_TOKEN:?METRICS_TOKEN is required}`；提供临时 token 时 Compose 配置成功，清除 token 时配置解析返回非零并阻止服务启动。该规则确保预发/生产不会在监控令牌缺失时静默运行；业务页面和小程序范围不变，评审保持通过。

### 2.23 V1.45 Web 页面匿名事件复评

新增受 JWT 保护的 `POST /orders/lifecycle/client-events`，DTO 仅接受四类事件、三个 Web 页面 surface、有限命令类型和 `source=WEB`；服务端将事件写入有界指标计数器与结构化日志，不写订单/审计业务事实，也不接收客户联系方式、表单原文或照片内容。创建订单页、订单列表和离线同步页均采用不阻塞业务的 fire-and-forget adapter，并对网络失败静默降级。事件专项 2/2、API 全量 437/437/0/0、Web 全量 621/621、API/Web/Shared TypeScript、Docker-backed Chrome 完整履约 E2E（fixture `E2E-1786772936517`）均通过；小程序继续按 PRD 4.3 延期，评审保持通过。

### 2.24 V1.46 运行期历史一致性对账复评

新增 `OrderLifecycleReconciliationService`，每 5 分钟执行一次只读历史一致性扫描；对终态质检/质保缺失、无 OPEN 核验单的历史矛盾以及版本账本缺口，按固定 invariant 映射 issue code。每个订单的创建/合并在同一事务中先取得 PostgreSQL advisory lock，再查找 OPEN case，因此多 API 实例重复扫描不会重复建单；已有 case 只合并新增 issue code。对账专项 2/2、API 全量 439/439/0/0、API TypeScript 通过；API Docker 重建健康启动，entrypoint 历史 gate 与 scheduler 首次扫描无错误。该服务不直接修复业务事实，小程序范围不变，评审保持通过。

### 2.25 V1.47 CI registry 兼容性复评

真实 PostgreSQL 与 Verify Store Flow 门禁已通过；备份恢复改用 PostgreSQL 17 client container，修复 runner 工具版本漂移。ACR 构建失败证据为 `unknown manifest class for application/vnd.oci.empty.v1+json`，因此发布 workflow 暂时关闭 provenance/SBOM，且 PRD 记录恢复条件；业务测试、数据库门禁和镜像构建本身不因此跳过。Test ECS 部署随后明确暴露缺少 `METRICS_TOKEN` secret，workflow 已改为安全注入并 fail-closed；在补齐该外部 secret 前预发发布不能通过。评审保持通过，生产发布仍未通过。

### 2.26 V1.48 Test 环境变量来源复评

Test 部署不再要求 GitHub `test` environment 配置 `METRICS_TOKEN`。SSH 脚本在 `/opt/mallbay` 先检查 `.env` 存在且含非空 `METRICS_TOKEN`，随后让 Docker Compose 直接读取该服务器环境文件；不再通过 `appleboy/ssh-action` 的 `envs` 传递或覆盖 token。这样与生产部署的服务器环境配置方式一致，同时保留缺失配置即退出的 fail-closed 行为。workflow YAML 静态校验通过，评审保持通过。

## 4. 最终完整性检查

| 维度 | 结论 | 通过证据 |
|---|---|---|
| 目标与价值 | 通过 | PRD 第 2、3 节定义现状风险、唯一 seam 目标和 0 容忍指标 |
| 范围与非目标 | 通过 | 第 4 节明确写入命令、调用端、迁移及不迁移的事实所有权 |
| 正常流程 | 通过 | 第 9 节覆盖普通下单、转单、施工、质检、收款、终交、取消、回退、跨店、离线 |
| 异常与恢复 | 通过 | 第 8、11.2、12、15 节覆盖重放、冲突、崩溃、通知失败、历史矛盾、网络未知与草稿恢复 |
| 状态与并发 | 通过 | 第 8.2、8.6、10 节明确 expectedVersion、条件来源状态、派生阶段和跨店双版本 |
| 角色与权限 | 通过 | 第 5 节明确 capability、scope、owner bypass、来源/执行门店隔离和无权不泄露 |
| 数据与字段 | 通过 | 第 6 节定义命令记录、版本账本、核验单、报价页面幂等字段的唯一约束、生命周期和敏感数据限制 |
| 页面操作 | 通过 | 第 11 节定义能力结构、稳定命令 ID、权威刷新、统一反馈、各页面操作、通用状态和用户影响总览 |
| 通知与审计 | 通过 | 第 13 节区分事务内事实/意图与提交后外部副作用 |
| 迁移与发布 | 通过 | 第 14 节规定维护窗口、历史预检、核验单覆盖、停止写入与向前修复 |
| 可观测性 | 通过 | 第 16 节给出指标口径、0 容忍项、页面恢复事件、结构化事件和待压测阈值 |
| 验收与追溯 | 通过 | AC-01 至 AC-35 及第 17.1 节追溯矩阵 |
| 可删除性与架构深度 | 通过 | AC-17 要求删除 optional、fallback、运行期注册、内部 use case 导出与客户端推断 |

## 5. 非阻塞跟进项

| ID | 严重度 | 事项 | 影响 | 责任角色 | 完成时点 | 是否阻塞进入研发 |
|---|---:|---|---|---|---|---:|
| F-01 | S2 | 将产品、API、Web/小程序、测试和发布责任角色绑定到具体人员 | 影响排期和签字，不改变规则 | 项目负责人 | 迭代启动前 | 否 |
| F-02 | S2 | 预发压测后确定版本冲突率、通知积压和命令耗时告警阈值 | 影响运行告警灵敏度 | 研发/运维负责人 | 发布评审前 | 否 |
| F-03 | S2 | 确定维护窗口日期、业务公告和当班负责人 | 影响发布执行 | 业务/运维负责人 | 发布评审前 | 否 |

以上事项在 PRD 第 21 节已有对应 owner 角色与阶段门禁；未完成不会阻止研发设计和实现，但对应阶段到达时必须阻断继续推进。

## 6. 评审结论

**代码实施评审通过，可进入预发验证；生产发布尚未通过。**

进入预发验证的基线是 PRD V1.48。后续若改变以下任一规则，必须重新进行需求评审并更新版本：命令集合、事实所有权、事务边界、幂等键范围、版本递增口径、不可逆事实门禁、角色权限、页面能力结构、未知结果恢复、跨店来源/执行门店职责、历史修复策略、发布切换方式、可观测性字段/指标口径、Web 页面事件白名单、运行期核验单幂等规则、Test/Production 环境变量来源或小程序延期范围。
