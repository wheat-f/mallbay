# Mallbay 端到端流程闭环实施方案

> **给执行代理的说明：** 必须使用 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans`，按任务逐项执行。每一步使用复选框跟踪，并在每个任务后运行对应验证。

**目标：** 用可重复的测试和状态驱动页面，打通 Mallbay 从销售订单、库存、采购、施工、质保到售后的完整业务链路。

**架构：** 增加一套可复用的 API 流程测试夹具，用确定性数据执行跨模块服务测试；每个模块继续维护自己的领域状态，并在详情接口返回明确的流程能力和就绪状态；Web 页面只根据接口状态展示操作，不在页面内自行推断业务阶段。

**技术栈：** NestJS 11、Prisma 7/PostgreSQL、Next.js 16、React 19、Ant Design 6、Node Test Runner、TypeScript、Docker Compose。

## 全局约束

- 保留当前分支 `codex/submit-store-use-case`。
- 所有业务统计和列表必须来自真实 API/数据库数据，禁止增加页面级硬编码业务数据。
- `docs/bug/`、`.codegraph/`、`apps/web/node_modules/` 不得提交。
- 本阶段不新增浏览器测试框架，使用现有 Node 测试和人工冒烟验收。
- 库存数量统一以批次基础单位计算，采购包装单位只作为展示和入库输入单位。
- 已完成的动作必须幂等，重复点击不能生成重复记录。
- 门店和角色权限必须由 API 强制校验，不能只依赖隐藏按钮。
- 页面刷新后必须从 API 恢复当前状态、草稿、照片和处理记录。

## 执行顺序

1. 建立确定性测试夹具和端到端测试入口。
2. 验证“有库存订单 → 出库 → 施工 → 质检 → 质保”的主链路。
3. 验证“库存不足 → 采购需求 → 多供应商采购 → 到货入库 → 恢复匹配”。
4. 验证整卷入库、按米/面积部分出库和剩余库存。
5. 固化销售订单商品修改与收款、施工状态之间的边界。
6. 将质保管理调整为质保卡列表，并修复质保日志入口。
7. 固化店长和施工人员不同的售后处理权限、证据和责任判定流程。
8. 将迁移、数据库预检、测试和构建加入 CI/生产部署门禁。

核心状态链：

```text
待派单
  -> 库存已锁定，或生成采购需求
  -> 库存已出库
  -> 施工已派工
  -> 施工人员已领取物料
  -> 施工中
  -> 施工完成
  -> 质检通过
  -> 质保卡生效
  -> 售后发起 -> 售后派单 -> 补充证据 -> 责任判定 -> 解决 -> 关闭
```

## 文件范围

### 流程测试基础

- 新建 `apps/api/src/testing/store-flow.fixture.ts`：创建固定门店、角色、客户、车辆、产品、库存批次和订单。
- 新建 `apps/api/src/testing/store-flow.assertions.ts`：封装订单、库存、采购、施工、质保和售后状态断言。
- 新建 `apps/api/src/flows/store-flow.e2e.test.ts`：执行正常库存、缺货采购和售后闭环测试。
- 修改 `apps/api/package.json`：增加 `test:flow` 命令。

### 订单、库存和采购

- 修改订单商业信息 use case、库存服务及其测试。
- 修改 `apps/web/app/orders/[id]/page.tsx`、库存匹配页和采购需求/采购订单创建页。
- 修改对应 feature API、页面测试和数据展示测试。

### 施工、质保和售后

- 修改施工、质保、售后服务和服务测试。
- 修改施工订单详情、质保列表/详情、售后详情/任务页面及其测试。

### 部署验收

- 修改 `apps/api/src/prisma/preflight-db-invariants.ts`、`docker-compose.prod.yml` 和 CI 工作流。
- 新建 `docs/qa/end-to-end-flow-checklist.md`，记录真实验收数据和最终状态。

---

## 任务 1：建立确定性的门店流程测试夹具

**文件：**

- 新建 `apps/api/src/testing/store-flow.fixture.ts`
- 新建 `apps/api/src/testing/store-flow.assertions.ts`
- 新建 `apps/api/src/flows/store-flow.e2e.test.ts`
- 修改 `apps/api/package.json`

**接口约定：**

- `createStoreFlowFixture(): StoreFlowFixture`
- `assertOrderState(fixture, expectedStatus): Promise<void>`
- `assertInventoryBalance(fixture, productId, expectedBaseQuantity): Promise<void>`
- `pnpm --filter @mallbay/api test:flow`

- [ ] **步骤 1：先写夹具契约测试**

验证固定 ID、客户与车辆关联、订单与客户/车辆关联，以及窗膜产品的销售单位和基础单位。

- [ ] **步骤 2：运行测试确认失败**

运行：`pnpm --filter @mallbay/api exec tsx --tsconfig tsconfig.app.json --test src/flows/store-flow.e2e.test.ts`

预期：因夹具模块不存在而失败。

- [ ] **步骤 3：实现夹具和断言**

固定以下角色和数据：门店 `store-flow-1`、店长 `manager-flow-1`、施工人员 `worker-flow-1`、客户 `customer-flow-1`、车辆 `vehicle-flow-1`、产品 `product-film-1`、订单 `order-flow-1`。夹具需要暴露 Prisma stub、服务实例和各模块查询方法，供后续测试复用。

- [ ] **步骤 4：增加测试命令并运行**

在 `apps/api/package.json` 增加：

```json
"test:flow": "tsx --tsconfig tsconfig.app.json --test src/flows/store-flow.e2e.test.ts"
```

预期：夹具契约测试通过。

- [ ] **步骤 5：提交任务 1**

```powershell
git add apps/api/src/testing apps/api/src/flows/store-flow.e2e.test.ts apps/api/package.json
git commit -m "test: add deterministic store flow fixture"
```

## 任务 2：验证有库存订单到质保的主链路

**文件：** `apps/api/src/flows/store-flow.e2e.test.ts`、库存/施工/质保服务及对应测试。

- [ ] **步骤 1：编写完整链路测试**

依次执行库存锁定、订单出库、施工派工、领取物料、开始施工、上传施工前/中/后照片、施工完成、质检通过和生成质保卡。

必须断言：

- 订单最终状态为 `WARRANTIED`；
- 18 米基础库存出库 12 米后余额为 6 米；
- 质保状态为 `ACTIVE`；
- 质保卡关联 3 张施工照片；
- 重复出库、重复完工和重复生成质保不会生成重复记录。

- [ ] **步骤 2：运行流程测试定位第一个断点**

运行：`pnpm --filter @mallbay/api test:flow`

- [ ] **步骤 3：只修复跨模块契约问题**

修复范围限定为：库存分配和出库状态、施工领取物料前置条件、订单状态同步、质检结果保存、质保照片复制和重复操作保护。

- [ ] **步骤 4：运行 API 全量测试和流程测试**

```powershell
pnpm --filter @mallbay/api test
pnpm --filter @mallbay/api test:flow
```

- [ ] **步骤 5：提交任务 2**

```powershell
git add apps/api/src/flows apps/api/src/inventory apps/api/src/construction apps/api/src/warranties
git commit -m "fix: close order to warranty state transitions"
```

## 任务 3：验证缺货采购恢复链路

**文件：** 库存服务测试、流程测试、采购需求页、采购订单创建页及其测试。

- [ ] **步骤 1：编写缺货链路测试**

构造库存为 0、需求为 18 米的订单；生成采购需求；拆分为供应商 A 采购 10 米、预计 2026-07-20 到货，供应商 B 采购 8 米、预计 2026-07-22 到货；分别到货后断言需求状态依次为 `PARTIAL_RECEIVED`、`FULFILLED`，订单重新具备库存匹配条件。

- [ ] **步骤 2：运行测试定位状态不一致**

运行：`pnpm --filter @mallbay/api test:flow`

- [ ] **步骤 3：落实采购不变量**

禁止未取消采购单总量超过剩余需求；每个供应商保存独立到货日期；`PARTIAL_ORDERED`、`ORDERED`、`PARTIAL_RECEIVED`、`FULFILLED` 按订购量和到货量准确计算；已完成或已取消的需求不可再次选择。

- [ ] **步骤 4：增加页面回归断言**

采购订单创建页必须展示供应商、采购数量和独立到货日期；已完成需求必须禁用且不可提交。

运行：`pnpm --filter @mallbay/web test`

- [ ] **步骤 5：提交任务 3**

```powershell
git add apps/api/src/flows apps/api/src/inventory apps/web/app/purchases apps/web/src/features/purchases
git commit -m "fix: close shortage procurement recovery flow"
```

## 任务 4：锁定部分单位出库和剩余库存

**文件：** `apps/api/src/inventory/domain/unit-conversion.test.ts`、库存服务/流程测试、Web 单位转换和匹配测试。

- [ ] **步骤 1：增加换算矩阵**

覆盖以下场景：

| 入库 | 基础库存 | 出库 | 预期余额 |
|---|---:|---:|---:|
| 1 卷，18 米/卷 | 18 米 | 12 米 | 6 米 |
| 1 卷，15 米/卷 | 15 米 | 5 米 | 10 米 |
| 1 卷，30 米/卷 | 30 米 | 12.5 米 | 17.5 米 |
| 1 件，20000 平方厘米/件 | 20000 平方厘米 | 12000 平方厘米 | 8000 平方厘米 |

- [ ] **步骤 2：运行 API 和 Web 单元测试**

```powershell
pnpm --filter @mallbay/api exec tsx --tsconfig tsconfig.app.json --test src/inventory/domain/unit-conversion.test.ts src/inventory/inventory.service.test.ts
pnpm --filter @mallbay/web exec tsx --tsconfig tsconfig.json --test src/features/inventory/unit-conversion.test.ts src/features/inventory/matching.test.ts
```

- [ ] **步骤 3：修复精度和流水快照**

流水必须保存数量、单位、来源单位、目标单位和换算率；出库数量超过剩余锁定基础数量时必须拒绝。

- [ ] **步骤 4：重新运行矩阵和完整流程**

预期：各场景余额精确等于表格中的基础单位余额。

- [ ] **步骤 5：提交任务 4**

```powershell
git add apps/api/src/inventory apps/api/src/flows apps/web/src/features/inventory
git commit -m "test: harden partial unit outbound scenarios"
```

## 任务 5：明确订单商品修改和收款边界

**文件：** 订单商业信息 use case、订单详情页、对应 API 和页面测试。

- [ ] **步骤 1：编写边界测试**

覆盖：未收齐款且未施工完成时允许修改；全额收款后拒绝并返回 `ORDER_COMMERCIALS_FINALIZED`；施工完成后拒绝并返回 `ORDER_CONSTRUCTION_COMPLETED`；删除已锁定商品时释放锁定；增加数量不足库存时生成或更新采购需求。

- [ ] **步骤 2：运行 use case 测试**

运行：`pnpm --filter @mallbay/api exec tsx --tsconfig tsconfig.app.json --test src/orders/use-cases/update-order-commercials.use-case.test.ts`

- [ ] **步骤 3：接口返回统一流程能力**

订单详情返回 `commercialsEditable`、`editBlockedReason`、`inventoryMatched`、`inventoryOutbound`、`constructionAssigned`、`paymentFinalized`。页面只能消费这些字段，不能通过中文状态文案推断是否可编辑。

- [ ] **步骤 4：运行订单 API 和 Web 测试并提交**

```powershell
pnpm --filter @mallbay/api test
pnpm --filter @mallbay/web exec tsx --tsconfig tsconfig.json --test src/features/orders/order-detail-page.test.ts
git add apps/api/src/orders apps/web/app/orders apps/web/src/features/orders
git commit -m "fix: enforce order commercial edit boundary"
```

## 任务 6：将质保管理调整为质保卡中心

**文件：** 质保服务、质保列表/详情页及对应测试。

- [ ] **步骤 1：增加列表和详情契约测试**

列表每行必须来自 `Warranty.id`，展示质保编号、客户、车辆、质保范围、起止日期、状态和操作。已完工但尚未生成质保卡的工单只能出现在“待生成质保”统计，不得混入质保卡列表。

- [ ] **步骤 2：增加“查看质保日志”交互测试**

点击后必须打开抽屉或弹窗，并展示生成、状态变更、作废/重置和关联售后事件，按时间倒序排列。

- [ ] **步骤 3：实现列表与生成候选分离**

质保卡列表和待生成候选使用独立接口结果，不将工单和质保卡合并成同一列表。

- [ ] **步骤 4：运行测试并提交**

```powershell
pnpm --filter @mallbay/api exec tsx --tsconfig tsconfig.app.json --test src/warranties/warranties.service.test.ts
pnpm --filter @mallbay/web exec tsx --tsconfig tsconfig.json --test src/features/warranties/page.test.ts src/features/warranties/detail-page.test.ts
git add apps/api/src/warranties apps/web/app/warranties apps/web/src/features/warranties
git commit -m "fix: make warranty management card centric"
```

## 任务 7：按角色固化售后处理流程

**文件：** 售后服务、售后详情/任务页及对应测试。

- [ ] **步骤 1：增加权限和状态测试**

施工人员调用责任判定接口必须返回 403；店长不能冒充未被指派的施工人员上传证据；被指派施工人员可以上传多张施工后照片和补充证据；缺少必要证据时不能判责；已解决售后只能关闭一次。

- [ ] **步骤 2：增加页面角色测试**

店长页面展示派单、责任判定、解决方案、处罚和关闭；施工人员页面展示多图片上传、预览和证据说明，但不展示责任判定和处罚控件。

- [ ] **步骤 3：统一接口能力字段**

售后详情返回 `canAssign`、`canSubmitEvidence`、`canJudgeResponsibility`、`canClose`，页面和 API 使用相同的角色/指派规则。

- [ ] **步骤 4：把售后闭环加入流程测试**

从有效质保卡发起售后，完成派单、施工人员上传多张照片和文字说明、店长判责、处理、关闭，并断言每个处理日志包含操作者和时间。

- [ ] **步骤 5：运行测试并提交**

```powershell
pnpm --filter @mallbay/api exec tsx --tsconfig tsconfig.app.json --test src/after-sales/after-sales.service.test.ts src/flows/store-flow.e2e.test.ts
pnpm --filter @mallbay/web exec tsx --tsconfig tsconfig.json --test src/features/after-sales/page.test.ts
git add apps/api/src/after-sales apps/api/src/flows apps/web/app/after-sales apps/web/src/features/after-sales
git commit -m "fix: enforce role driven after-sales workflow"
```

## 任务 8：建立部署和 CI 验收门禁

**文件：** 数据库预检、`docker-compose.prod.yml`、CI 工作流和验收清单。

- [ ] **步骤 1：在 CI 中增加完整检查**

按顺序运行：

```powershell
pnpm install --frozen-lockfile
pnpm --filter @mallbay/api test
pnpm --filter @mallbay/api test:flow
pnpm --filter @mallbay/web test
pnpm typecheck
pnpm build
```

- [ ] **步骤 2：确认生产启动顺序**

API 容器按 `prisma migrate deploy`、数据库不变量预检、启动 API 的顺序执行；迁移或预检失败时不得继续接受请求。

- [ ] **步骤 3：编写人工验收清单**

记录三次真实运行：有库存订单闭环、缺货采购恢复、18 米卷出库 12 米后剩余 6 米。每次记录订单号、批次号、采购需求号、采购订单号、施工记录号、质保号、售后号和最终状态。

- [ ] **步骤 4：本地构建生产镜像**

```powershell
docker build --target api-runner -t mallbay-api:flow-check .
docker build --target web-runner -t mallbay-web:flow-check .
```

预期：镜像构建成功，API 运行时可以解析 `bcryptjs`。

- [ ] **步骤 5：运行最终验证并提交**

```powershell
pnpm --filter @mallbay/api test
pnpm --filter @mallbay/api test:flow
pnpm --filter @mallbay/web test
pnpm typecheck
pnpm build
git add apps/api/src/prisma/preflight-db-invariants.ts docker-compose.prod.yml .github/workflows/deploy.yml docs/qa/end-to-end-flow-checklist.md
git commit -m "ci: gate deployment on complete store flow"
```

## 本阶段暂不纳入

发票开具/作废/重开、客户返利审核付款、佣金结算、费用报销审批仍保留现有功能，但不阻塞本阶段主履约链路。它们必须继续关联真实订单和付款数据，自动记账和结算规则另行形成财务闭环方案。

## 最终验收标准

- 同一笔订单无需手工改数据库即可从创建走到质保和售后关闭。
- 每个动作完成后刷新页面，操作按钮和状态立即反映最新结果。
- 照片、草稿、指派、证据和状态在刷新后仍由 API 正确恢复。
- 缺货订单可以生成采购任务，到货后恢复库存匹配。
- 部分出库保留精确基础单位余额，并产生可审计库存流水。
- 质保管理展示质保卡，不把施工工单当作质保卡列表。
- 店长和施工人员看到的售后操作符合各自权限。
- CI 和生产启动均执行迁移、数据库预检、测试和构建门禁。
