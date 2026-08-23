# ConstructionFulfillment 深化 PRD

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 需求名称 | ConstructionFulfillment 深化：施工阶段履约统一 seam |
| 文档版本 | v0.2 |
| 当前状态 | 已评审通过 / 待实施 |
| 创建日期 | 2026-08-23 |
| 需求类型 | 架构深化 / 履约执行边界收拢 |
| 关联材料 | `CONTEXT.md`；ADR-0006；ADR-0011；跨店施工履约子 PRD；架构评审报告 `architecture-review-20260823-1158.html` |
| 关联代码 | `apps/api/src/construction/construction-fulfillment.ts`；`construction.service.ts`；`cross-store-construction.service.ts`；`construction.controller.ts` |

## 2. 需求背景

### 2.1 业务背景

MallBay 的施工履约包含订单施工阶段、施工证据、权威履约能力、跨店施工任务和最终交付前置条件。当前 `ConstructionFulfillment` 已承担履约视图、能力解释、部分施工命令和跨店命令，但 `ConstructionController` 仍同时直接依赖多个 implementation。

### 2.2 当前问题

1. controller 同时知道 `ConstructionService`、`CrossStoreConstructionService`、`ConstructionFulfillment`、容量预留和成本结算 service，履约知识分散在多个 caller。
2. `ConstructionFulfillment` 的普通施工命令仍是薄 adapter；履约视图、跨店权限和 `OrderLifecycle` 能力组合已经在 seam 内，但边界没有完全收口。
3. `ConstructionService` 同时包含施工阶段命令、施工证据、照片、物料、工人、排班和离线同步等多个 implementation 责任，直接作为 external seam 会扩大测试面。
4. 如果后续 caller 绕过 `ConstructionFulfillment` 自行解释施工完成、质检或跨店状态，可能违反“施工证据不等于最终交付”的 ownership 约束。

### 2.3 需求依据

- `CONTEXT.md` 已定义：履约命令、权威履约结果、履约版本、履约命令标识和施工证据。
- ADR-0006 明确：施工履约 module 提供施工阶段、能力、阻塞原因和施工证据；订单最终交付由 `OrderLifecycle` 拥有。
- ADR-0011 明确：施工证据采用 append-only 方式保存。
- 跨店施工履约子 PRD 已定义跨店任务状态、源门店/执行门店权限和源门店确认边界。
- 当前架构评审结论：`ConstructionFulfillment` 是具有真实 depth 的 seam，但 controller 仍泄漏多个 implementation。

## 3. 产品 / 架构目标

1. 为施工履约 caller 提供一个稳定的 `ConstructionFulfillment` external seam，集中读取、能力解释、施工阶段命令和跨店履约入口。
2. 使 controller 不再直接调用 `ConstructionService` 或 `CrossStoreConstructionService` 来完成施工履约相关操作。
3. 将 actor、权限、`commandId`、`expectedVersion`、`taskVersion`、权威生命周期读取和阻塞原因的组合规则集中在 seam 内。
4. 保持 `OrderLifecycle` 对订单最终交付状态的 ownership；不把施工完成、质检通过或证据完整解释为最终交付。
5. 保持现有 HTTP 路径、DTO 和返回字段兼容，降低 Web caller 的迁移风险。
6. 通过 contract test、集成测试和 deletion test 证明 seam 具有真实 leverage，而不是增加一层透明包装。

### 3.1 成功指标

| 指标 | 口径 | 当前基线 | 本期目标 | 验证方式 |
|---|---|---|---|---|
| 履约路由直接依赖 implementation 数量 | 施工履约相关 controller 方法直接调用 `ConstructionService` / `CrossStoreConstructionService` 的数量 | 当前至少存在跨店详情直接调用 `crossStore.get`，且普通命令通过 Fulfillment 转发 | 归零 | 静态检索 + code review |
| 履约解释重复实现 | caller 自行组合 lifecycle/capability/跨店权限的实现数量 | controller 外部存在泄漏风险 | 新增 caller 统一使用 Fulfillment | 静态检索 + contract test |
| seam contract 覆盖 | 关键履约规则有可执行测试的比例 | 现有部分测试覆盖 | 覆盖普通命令、跨店命令、读取失败、权限、版本冲突和兼容返回 | API test |
| API 兼容性 | 既有 route、DTO、字段和错误语义的回归情况 | 现有行为 | 无破坏性变化 | API/Web typecheck、全量测试 |

目标值为本期架构验收目标，不代表业务经营指标；不新增用户行为埋点或通知需求。

## 4. 本期范围

### 4.1 本期包含

- 统一普通施工履约读取入口：履约详情、履约列表、能力读取。
- 统一普通施工阶段命令入口：派工、开工、完工、质检。
- 统一跨店履约入口：任务列表、任务详情、执行门店接受/拒绝、源门店取消、执行门店提交接受、源门店接受。
- 由 `ConstructionFulfillment` 统一编排权限、生命周期、版本和任务版本上下文。
- 将施工履约相关 controller route 切换到 `ConstructionFulfillment`。
- 保持现有 route、DTO、header 和返回结构兼容。
- 维护临时兼容 adapter，但禁止新增绕过 seam 的履约 caller。
- 增加 contract test、必要的集成测试、删除直接依赖的 deletion test 和静态 caller inventory。
- 同步 CONTEXT、相关 ADR/实施计划和变更记录。

### 4.2 本期不包含

- 不改变订单最终交付规则，不将最终交付迁入 `ConstructionFulfillment`。
- 不改变 `OrderLifecycle` 的最终交付、订单版本推进或状态转换 ownership。
- 不合并容量预留、施工成本结算、员工档案、排班、请假和施工物料为履约 seam。
- 不迁移照片、材料、工人、排班和离线同步等非履约操作，除非其现有 route 已明确属于施工履约命令/视图。
- 不改变跨店任务状态枚举、业务状态规则或源/执行门店权限模型。
- 不新增现金事实、库存事实或其他平行 writer。
- 不修改 HTTP 路径、DTO 字段或 Web 页面交互。
- 不在本期删除仍被非履约 caller 使用的 `ConstructionService`。

## 5. 用户角色与数据范围

| 角色/调用方 | 使用场景 | 可查看内容 | 可执行操作 | 数据范围 |
|---|---|---|---|---|
| 执行门店施工人员 | 查看本人可执行的施工任务并更新阶段 | 执行门店履约视图、必要的客户/车辆字段、施工证据摘要 | 开工、完工；现有权限允许时执行其他施工命令 | 本人被分配任务或执行门店范围，遵循现有 `construction` 权限 |
| 执行门店管理者 | 管理本门店施工履约 | 执行门店订单、任务、能力和阻塞原因 | 派工、开工、完工、质检、跨店接受/拒绝/提交接受 | 执行门店范围 |
| 源门店管理者 | 管理跨店履约结果 | 源门店订单和跨店任务结果 | 源门店取消、源门店接受；查看源门店范围任务 | 源门店范围，遵循 `orders.lifecycle:cross_store_source_manage` |
| 运营/系统 caller | 复用权威履约结果 | `FulfillmentView`、列表项、能力和生命周期结果 | 仅按已有 actor/context 权限执行 | 不扩大现有权限 |

权限判断必须继续使用 `AccessContext` 的现有 capability：`construction.read`、`construction.write` 和 `orders.lifecycle.cross_store_source_manage`。本 PRD 不新增角色和权限码。

## 6. 核心业务对象

| 对象 | 定义 | 关键字段/事实 | 状态 | 归属 |
|---|---|---|---|---|
| 订单履约结果 | 订单当前履约阶段、能力、阻塞原因和版本的权威解释 | orderId、currentStage、capabilities、blockingReasonCodes、lifecycleVersion | 由 `OrderLifecycle` 定义 | `OrderLifecycle` |
| 施工记录 | 订单在施工阶段产生的记录 | constructionRecordId、status、startedAt、completedAt、qualityResult、qualityCheckedAt | 现有施工状态 | Construction implementation |
| 跨店施工任务 | 源门店订单交由执行门店履约的任务 | taskId、orderId、sourceStoreId、executionStoreId、status、taskVersion | 使用现有 `CrossStoreTaskStatus` | Cross-store construction implementation |
| 施工证据 | 证明施工实际发生或完成的照片、材料、质检和现场记录 | evidence id、stage、actor、createdAt、追加关系 | append-only | Construction module |
| 履约命令上下文 | 一次履约业务意图及其并发前提 | commandId、expectedVersion、taskVersion、source | 不持久化为新对象 | `ConstructionFulfillment` / `OrderLifecycle` |

## 7. 核心流程

### 7.1 普通施工履约读取

1. caller 请求订单履约详情、能力或施工履约列表。
2. `ConstructionFulfillment` 校验执行门店/订单门店的读取权限。
3. seam 读取订单、施工记录、库存/质保等现有事实，并调用 `OrderLifecycle` 计算权威履约结果。
4. 系统返回施工事实与权威生命周期的组合结果；caller 不自行补充能力解释。
5. 若单订单权威生命周期不可用，详情返回结构化失败；列表保留施工事实并返回 `lifecycleError`，不得把失败解释为“无阻塞”。

### 7.2 普通施工履约命令

1. caller 通过现有 route 提交命令，并携带 `idempotency-key` 与 `x-lifecycle-version`。
2. controller 将 header 转换为现有命令上下文，调用 `ConstructionFulfillment`。
3. seam 校验 actor、门店范围、命令上下文和当前权威能力。
4. seam 归一化 actor 和命令上下文后，唯一调用 `OrderLifecycle.transition`；`OrderLifecycle.transition` 再调用其已注册的 construction implementation 完成施工事实、订单履约版本、命令记录和证据写入。
5. `OrderLifecycle.transition` 唯一拥有命令写事务、幂等记录、履约版本变化、错误持久化和 applied/replayed/rejected 观测；`ConstructionFulfillment` 不开启第二个写事务、不直接修改订单或施工状态。
6. 成功或幂等重放时返回现有 `OrderLifecycle.transition` payload；前置条件被拒绝时沿用现有 HTTP 异常和错误码；版本冲突或能力不可用时不产生部分状态变化。

### 7.3 跨店履约

1. caller 查询跨店任务列表或详情。
2. seam 根据 source/execution 两侧权限裁剪任务与能力。
3. 执行门店接受/拒绝任务，或在履约完成后提交 source acceptance；源门店可在现有条件满足时取消或接受。
4. `ConstructionFulfillment` 读取任务并通过 `OrderLifecycle` 执行订单履约转换，跨店 implementation 负责任务事实读取/持久化。
5. 执行门店施工完成或提交接受不得直接把源门店订单标记为最终交付完成。

### 7.4 迁移流程

1. 建立履约 route 与 caller inventory，标记普通施工和跨店相关直接依赖。
2. 在 `ConstructionFulfillment` 内完成读取/命令/跨店协调的真实编排，保留兼容调用但不新增业务逻辑副本。
3. 将 `ConstructionController` 的履约相关 route 全部切换到 seam；`cross-store/product-mappings`、容量、成本结算和非履约施工 route 保持各自 service。
4. 收紧 module exports，确保新增 caller 只能依赖 `ConstructionFulfillment`；旧 `ConstructionService` 仅为仍有非履约 caller 时保留。
5. 通过测试、静态检索和 deletion test 后，清理不再需要的履约 adapter。inventory 至少覆盖 `ConstructionController`、`ConstructionModule` exports、API tests、offline sync、跨模块 imports 和 Web/API caller；每项标记 fulfillment/non-fulfillment、迁移动作和保留原因。

## 8. 功能需求

### 8.1 统一履约读取

#### 规则 R-READ-01：履约详情

- 适用对象：订单履约详情 caller。
- 前置条件：订单存在，且 actor 对执行门店或订单门店拥有 `construction.read`。
- 触发条件：调用 `GET /construction/orders/:orderId/fulfillment`。
- 系统动作：由 `ConstructionFulfillment` 读取订单/施工事实，调用 `OrderLifecycle.getAuthoritativeLifecycle`，组合现有 `FulfillmentView`。
- 结果：返回订单、施工记录、workflow、lifecycle 和 `generatedAt`；不改变既有字段语义。
- 例外：订单不存在或无权限时沿用现有拒绝语义；权威生命周期不可用时详情失败关闭。

#### 规则 R-READ-02：履约列表

- 适用对象：施工履约列表 caller。
- 前置条件：actor 对查询门店拥有 `construction.read`。
- 触发条件：调用 `GET /construction/fulfillments`。
- 系统动作：由 seam 读取施工记录和订单事实，批量获取权威生命周期，合并列表项。
- 结果：返回现有 `FulfillmentList`；单条生命周期失败时返回 `lifecycleError`，不伪造 capabilities。
- 例外：空列表返回空 `items`，不因无记录调用生命周期。

#### 规则 R-READ-03：跨店任务详情

- 适用对象：源门店/执行门店跨店 caller。
- 前置条件：actor 至少对任务关联的 source 或 execution 门店拥有现有读取权限。
- 触发条件：调用 `GET /construction/cross-store/tasks/:id`。
- 系统动作：由 `ConstructionFulfillment` 统一加载任务、权限裁剪和相关生命周期。
- 结果：不再由 controller 直接调用 `CrossStoreConstructionService.get`；保持任务详情字段兼容。

### 8.2 统一施工阶段命令

适用 route：

- `POST /construction/orders/:orderId/assign`
- `POST /construction/orders/:orderId/start`
- `POST /construction/orders/:orderId/complete`
- `POST /construction/records/:recordId/quality-check`

命令统一规则：

- `idempotency-key` 为空时拒绝执行，不产生业务写入。
- `x-lifecycle-version` 缺失、非数字或与当前版本不匹配时拒绝执行，不产生部分状态变化。
- 命令执行前必须检查 actor 的当前能力；能力不可用时返回稳定业务错误。
- 同一命令标识重试返回原业务结果；不同命令标识不得绕过当前状态和版本校验。
- 施工完成、质检通过和施工证据写入不得单独改变订单最终交付 ownership。

执行 authority 固定为：

```text
ConstructionController
  → ConstructionFulfillment（权限、actor/context 归一化、入口收口）
  → OrderLifecycle.transition（唯一命令事务 / 幂等 / 版本 / 观测 owner）
  → registered construction implementation（施工事实与证据 persistence）
```

`ConstructionFulfillment` 不得直接调用 `ConstructionService.assignOrder/startOrder/completeOrderForOrder/qualityCheck` 形成第二条命令路径；`ConstructionService` 可以继续承载非履约操作和底层 implementation，但不再作为这些履约命令的 external adapter。

### 8.3 统一跨店履约命令

适用 route：

- `POST /construction/cross-store/tasks/:id/accept`
- `POST /construction/cross-store/tasks/:id/reject`
- `POST /construction/cross-store/tasks/:id/cancel`
- `POST /construction/cross-store/tasks/:id/submit-acceptance`
- `POST /construction/cross-store/tasks/:id/source-accept`

命令统一规则：

- `idempotency-key`、`x-lifecycle-version`、`x-task-version` 均作为现有命令上下文传递。
- 执行门店命令只能在任务的 execution scope 和现有任务状态允许时执行。
- source 命令只能在 source scope 和现有任务状态允许时执行。
- 任务版本冲突时不覆盖并发更新，返回稳定冲突结果。
- `OrderLifecycle` 继续执行订单生命周期转换；`ConstructionFulfillment` 不直接修改订单最终交付状态。
- 任务状态和施工证据沿用现有状态/append-only 规则，不新增平行状态枚举。

跨店命令同样统一调用 `OrderLifecycle.transition`；Fulfillment 只负责加载任务、校验 source/execution scope、组装 command 和 context。任务版本校验、订单履约版本变化、事务、幂等和观测由 `OrderLifecycle.transition` 及其 registered construction implementation 负责。

### 8.4 内部 seam 与 adapter 规则

- external seam：`ConstructionFulfillment`，面向施工履约 controller 和后续 caller。
- internal implementation：施工记录/证据的 `ConstructionService`、跨店任务 implementation 和 `OrderLifecycle`。
- adapter：允许临时存在以兼容未迁移的非履约 caller；不得把 adapter 变成第二套业务逻辑。
- command result：成功和幂等重放返回现有 `OrderLifecycle.transition` payload；被拒绝沿用已有 HTTP 异常/错误码，不新增包装响应。
- transaction/observability：命令只允许由 `OrderLifecycle.transition` 持有写事务，并记录命令状态、版本变化和 applied/replayed/rejected 结果；Fulfillment 不另开外层状态写事务。
- deletion test：移除 controller 对普通施工/跨店履约 implementation 的直接依赖后，权限、版本、能力、生命周期和任务状态组合规则仍只在 seam/其明确 implementation 中存在。
- interface is test surface：所有 external seam 的可观察行为必须有 contract test；不以“调用转发成功”作为唯一测试。

## 9. 状态与 ownership

### 9.1 订单履约状态

订单履约阶段和最终交付状态由 `OrderLifecycle` 定义和推进。`ConstructionFulfillment` 只能读取权威阶段/能力或通过既有命令入口请求转换。

### 9.2 跨店任务状态

沿用现有 `CrossStoreTaskStatus`，不在本期重命名或新增状态。状态流转以现有跨店子 PRD 为准：

```text
PENDING_ACCEPTANCE
  ├─→ ACCEPTED
  └─→ REJECTED
ACCEPTED → READY_TO_DISPATCH
READY_TO_DISPATCH → DISPATCHED
DISPATCHED → IN_CONSTRUCTION
IN_CONSTRUCTION → PENDING_SOURCE_ACCEPTANCE
PENDING_SOURCE_ACCEPTANCE ├─→ COMPLETED
                          └─→ IN_CONSTRUCTION
任意非终态 → CANCELLED（仅在既有取消条件满足时）
```

### 9.3 施工证据

照片、材料、质检和现场记录继续由施工 module 负责，并采用 append-only 方式新增、补充或撤销关联；不得用履约 seam 的 DTO 静默覆盖历史证据。

## 10. API 与数据契约

### 10.1 保持兼容的 HTTP 契约

| 类别 | 现有入口 | 本期处理 | 兼容要求 |
|---|---|---|---|
| 履约列表 | `GET /construction/fulfillments` | 改由 Fulfillment 统一编排 | 路径、query、返回字段兼容 |
| 履约详情 | `GET /construction/orders/:orderId/fulfillment` | 改由 Fulfillment 统一编排 | 路径、返回字段兼容 |
| 普通命令 | assign/start/complete/quality-check | 改由 Fulfillment 统一编排 | header、DTO、错误语义兼容 |
| 跨店查询 | tasks list/detail | list/detail 均由 Fulfillment 统一编排 | 返回字段兼容，权限不放宽 |
| 跨店命令 | accept/reject/cancel/submit/source-accept | 保持现有 route | 三类版本上下文继续传递 |

### 10.2 不新增持久化字段

本期是 seam/ownership 收拢，不新增数据库表、枚举、业务字段或迁移。若实现发现必须修改数据契约，必须先记录为技术评估项并重新评审。

## 11. 页面与交互

本期无页面视觉改版。Web 继续使用现有 endpoint 和 DTO。

必须保持以下状态反馈：

- 正常加载：返回现有订单/施工/生命周期结构。
- 空列表：返回空 `items`，不显示虚假能力。
- 无权限：保持现有 `ForbiddenException` 业务语义，不泄露其他门店敏感字段。
- 版本冲突：提示调用方刷新权威履约结果后重试，不自动覆盖。
- 生命周期不可用：详情显示错误态；列表项保留事实并明确 `lifecycleError`。
- 状态已变化：返回现有状态冲突语义，不重复写入施工事实。

## 12. 权限与数据范围

| 操作 | 权限 | 数据范围 | 无权限处理 |
|---|---|---|---|
| 查看普通履约详情/列表 | `construction.read` | execution store 或现有可见 store | 拒绝或返回现有无权限语义 |
| 执行派工/开工/完工/质检 | `construction.write`，并遵循 assigned worker 规则 | execution store / assigned worker | 拒绝，不产生写入 |
| 查看跨店任务 | source 或 execution 读取权限 | 按 source/execution 裁剪 | 拒绝或裁剪敏感字段 |
| 执行门店跨店命令 | `construction.write` on execution store | execution scope | 拒绝，不推进任务 |
| 源门店取消/接受 | `orders.lifecycle.cross_store_source_manage` on source store | source scope | 拒绝，不推进订单 |

本期不新增角色、权限码或组织范围规则；如现有 `AccessContext` 规则与 route 行为冲突，作为 S1 评审问题处理，不在实现中静默放宽权限。

## 13. 异常与边界

| 场景 | 条件 | 系统处理 | 用户/调用方反馈 |
|---|---|---|---|
| 命令标识缺失 | `idempotency-key` 缺失或为空 | 拒绝且不写入 | 参数错误 |
| 履约版本冲突 | expectedVersion 不等于当前权威版本 | 拒绝且不写入 | 版本冲突，需刷新 |
| 跨店任务版本冲突 | taskVersion 不等于当前任务版本 | 拒绝且不覆盖并发事实 | 任务已变化 |
| 能力不可用 | 当前阶段/前置事实不满足 | 拒绝命令 | 返回阻塞原因 |
| 重复命令 | 同一 commandId 重试 | 返回原业务结果 | 幂等重放 |
| 不同命令重复推进 | 新 commandId 但状态已变化 | 按当前状态拒绝 | 状态冲突 |
| 订单不存在 | orderId 无记录 | 不泄露跨门店存在性 | 现有无权/不存在语义 |
| 生命周期读取失败 | 权威结果无法生成 | 详情失败关闭；列表标记 `lifecycleError` | 不显示伪造能力 |
| 一侧门店无权 | source/execution 任一不满足权限 | 裁剪或拒绝，按现有实现 | 不泄露敏感字段 |
| 非履约 route | 容量/成本/物料/照片等 route | 继续走专属 service | 不受本期影响 |
| 旧 caller 存在 | 非履约 caller 仍依赖 `ConstructionService` | 保留兼容 adapter，不新增履约绕行 | 无 API 变化 |

## 14. 验收标准

### 14.1 seam 与依赖收口

1. Given 施工履约相关 route，When 静态检索 controller 调用，Then 普通施工命令、履约读取和跨店任务读写均通过 `ConstructionFulfillment`，不直接调用 `ConstructionService`/`CrossStoreConstructionService`。
2. Given 容量、成本、物料、照片等非履约 route，When 执行原有调用，Then 仍由各自 service 处理，未被错误并入 Fulfillment。
3. Given 移除 controller 对施工履约 implementation 的直接依赖，When 运行 contract test 和 deletion test，Then 权限、能力、版本、任务状态与生命周期组合规则仍可验证且未复制到 controller。

### 14.2 读取

4. Given 用户对订单执行门店拥有 `construction.read`，When 请求履约详情，Then 返回现有 `FulfillmentView` 字段和权威 lifecycle。
5. Given 用户无订单执行门店和订单门店读取权限，When 请求履约详情，Then 请求被拒绝且不返回施工或客户敏感字段。
6. Given 履约列表中一条订单的生命周期读取失败，When 请求列表，Then 该条保留施工事实并返回 `lifecycleError`，不产生虚假的 enabled capability。
7. Given 跨店任务用户仅具备执行门店权限，When 查看任务详情，Then 返回执行范围允许的字段，不泄露源门店敏感信息。

### 14.3 普通命令

8. Given 当前生命周期允许派工/开工/完工/质检且命令上下文版本正确，When 调用对应 route，Then Fulfillment 调用 `OrderLifecycle.transition`，命令成功并返回现有 transition payload，施工事实与权威履约结果按现有规则变化。
9. Given expectedVersion 过期，When 提交普通施工命令，Then 返回版本冲突，施工记录、订单状态和证据均不产生部分写入。
10. Given 同一 commandId 重复提交，When 第一次已成功，Then `OrderLifecycle.transition` 返回原业务结果并记录 replayed 观测，不重复产生施工事实或履约版本变化。
11. Given 施工完成或质检通过，When 查询订单履约结果，Then 施工阶段可更新，但最终交付仍由 `OrderLifecycle` 的完整前置条件决定。

### 14.4 跨店命令

12. Given 任务处于 `PENDING_ACCEPTANCE` 且执行门店有写权限，When 执行门店接受，Then 任务进入现有 accepted 状态并记录现有事实。
13. Given taskVersion 过期，When 提交接受/拒绝/取消/提交接受/源接受，Then `OrderLifecycle.transition` 返回任务版本冲突且不覆盖并发更新，并记录 rejected 观测。
14. Given 执行门店完成施工并提交 source acceptance，When 源门店尚未接受，Then 任务仍处于等待源门店确认的现有状态，源门店订单不显示最终交付完成。
15. Given 源门店用户无 `orders.lifecycle.cross_store_source_manage`，When 执行源门店取消或接受，Then 请求被拒绝且任务/订单不变化。

### 14.5 兼容与验证

16. Given 现有 Web caller 使用原 route、DTO 和 header，When 执行回归测试，Then 不需要修改页面调用协议，API/Web typecheck 通过。
17. Given 旧 `ConstructionService` 仍有非履约 caller，When 收紧 module exports，Then 非履约行为保持可用；不得新增履约 caller 依赖旧 service。
18. Given API 全量测试、Web 全量测试、类型检查和 `git diff --check` 执行，Then 均通过，且新增 contract test 覆盖本 PRD 的关键规则。
19. Given 命令分别成功、幂等重放和前置条件拒绝，When 检查 `OrderLifecycle` 命令记录与观测，Then 三类结果分别可识别为 applied、replayed、rejected，且失败事务不留下部分施工/订单状态。

## 15. 测试要求

### 15.1 Contract test

- `ConstructionFulfillment` 读取详情/列表/能力的返回结构和 lifecycle 失败语义。
- 普通命令的权限、版本、幂等、状态冲突和最终交付 ownership。
- 跨店命令的 source/execution 权限、taskVersion、状态边界和结果裁剪。
- controller 不直接调用 implementation 的静态依赖检查。

### 15.2 集成测试

- `OrderLifecycle` 与施工 implementation 的原子写入/版本推进。
- 生命周期读取失败时详情与列表的不同反馈。
- 重试和并发命令不产生重复证据或重复状态变化。

### 15.3 回归测试

- construction service 现有施工证据、照片、物料、离线同步测试。
- cross-store construction 现有状态/权限测试。
- API typecheck、Web typecheck、API 全量测试、Web 全量测试。

## 16. 风险与依赖

| 风险/依赖 | 影响 | 应对 |
|---|---|---|
| `ConstructionService` 同时承载非履约功能 | 误删或误收口导致非履约回归 | 先做 caller inventory，按 route 分类，不做全类删除 |
| `OrderLifecycle` 与施工写入的事务边界 | 版本推进、施工事实和订单状态可能不一致 | 保持现有 `OrderLifecycle` transition 入口，新增集成测试 |
| 跨店 source/execution 权限裁剪 | 敏感数据泄露或合法操作被拒 | 保持现有 AccessContext capability，覆盖双门店矩阵 |
| 详情/列表对 lifecycle 失败的差异 | caller 误把错误当能力为空 | 固定结构化 `lifecycleError` 语义并测试 |
| 旧 caller 绕过新 seam | 长期形成双接口 | 禁止新增 caller，静态检索作为阶段门 |
| API 兼容与内部返回类型 | Web 回归 | 保持现有 DTO/route/字段，完成 Web typecheck 与测试 |

## 17. 阶段门

| 阶段门 | 通过条件 | 产物 |
|---|---|---|
| G1 设计确认 | 本 PRD 评审通过，ownership/排除项/失败语义无 S0/S1 未决项 | PRD 评审报告 |
| G2 caller inventory | 普通履约、跨店履约、非履约 route 分类完成 | caller inventory / 实施计划 |
| G3 seam 实现 | Fulfillment 内真实编排完成，controller 履约 route 已收口 | 代码 + contract tests |
| G4 兼容验证 | API/Web 类型检查与全量测试通过，旧非履约 caller 不回归 | 测试报告 |
| G5 文档与交付 | CONTEXT/ADR/实施计划同步，提交并推送完成 | 文档、commit、remote branch |

## 18. 待确认事项

本版根据设计拷问结果已确认以下关键事项：

- 普通施工与跨店履约统一由 `ConstructionFulfillment` 对外承载。
- 读取、命令、跨店协调在同一 external seam 内组织，内部可按职责拆分。
- `OrderLifecycle` 继续拥有最终交付 authority。
- 成本、容量、排班、物料和非履约施工能力不并入本期。
- 保持 API/DTO 兼容，旧 service 仅作为临时兼容 adapter。
- `commandId + expectedVersion`，跨店额外包含 `taskVersion`。
- 详情 lifecycle 失败关闭，列表返回结构化 `lifecycleError`。

非阻塞技术评估项：内部实现是否采用同文件私有协作者、独立 implementation 文件或模块内 domain service，由实施阶段依据现有依赖和测试隔离确定，不改变本 PRD 的 external seam 与 ownership。

## 19. 变更记录

| 版本 | 日期 | 变更内容 | 变更原因 | 修改人 |
|---|---|---|---|---|
| v0.1 | 2026-08-23 | 基于架构探索和设计拷问形成初版 | 明确 ConstructionFulfillment 深化范围与验收 | Codex |
| v0.2 | 2026-08-23 | 明确唯一命令 authority、事务/观测 owner、返回契约和 caller inventory | 关闭 PRD 评审阻塞项与高风险项 | Codex |
