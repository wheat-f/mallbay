# MallBay 五个架构深化候选实施 PRD｜需求评审报告

## 1. 评审信息

| 项目 | 内容 |
|---|---|
| 评审对象 | `docs/features/architecture-deepening-candidates-prd.md` |
| 文档版本 | V1.0 |
| 当前阶段 | 待评审 |
| 评审范围 | 五个候选的业务目标、范围、module responsibility、public interface、事务、权限、迁移、异常、测试和验收 |
| 评审依据 | `CONTEXT.md`、架构复盘文档、ADR-0001 至 ADR-0012、现有代码入口和测试文件 |
| 评审日期 | 2026-08-09 |

## 2. 结论摘要

### 总体结论

**有条件通过。可以进入任务拆分和实施前技术设计，不可跳过任务级规则补充直接编码。**

架构方向与已确认 ADR 一致，五个候选的责任划分、事实所有权和迁移原则基本成立。经过确认，采购超收、现金事实写入者、历史兼容、查询限制、施工证据视图、通知失败语义、状态分层、收款幂等键和错误码迁移范围已经明确；剩余问题主要是实施前需要从代码和权限目录提取的字段、触发条件、权限矩阵和性能基线。

### 问题统计

| 等级 | 数量 | 说明 |
|---|---:|---|
| S0 阻塞 | 0 | 方向性阻塞项已解决 |
| S1 高风险 | 2 | 需要在任务拆分前补齐具体矩阵和字段 |
| S2 一般问题 | 5 | 不阻塞方向，但需要补充 |
| S3 优化建议 | 2 | 可在进入研发后优化 |

### 优先确认事项

1. 采购收货超收、拒收和审批规则。
2. 五个候选的实际状态枚举、进入条件、退出条件和终态操作。
3. 企业收款、现金事实和跨 module transaction 的唯一写入者。
4. 各 module 的权限矩阵和具体数据范围。
5. 查询规模上限、性能目标和历史数据兼容策略。

## 3. 阻塞性问题

### ~~S0-1：采购超收规则未确定~~（已解决）

- 所在位置：PRD 第 9.3 条、第 19 条第 1 项。
- 解决结果：已确认默认拒绝超收。收货数量大于采购单未收数量时返回 `OVER_RECEIPT_NOT_ALLOWED`，不更新采购状态，不产生库存流水。
- 影响：会直接改变 `ProcurementFlow.receive`、`InventoryLedger.receive` 的输入校验、事务结果、状态流转和测试用例；研发无法确定接口行为。
- 修改建议：后续如需支持超收，另行设计超收策略和审批流程。
- 待确认角色：业务、产品、研发。
- 是否阻塞研发：否，已不再阻塞当前设计。

### S0-2：核心状态仍以代码枚举为准，PRD无法直接验收

- 所在位置：PRD 第 9.4 条、第 10.4 条。
- 问题描述：文档写明“实际状态枚举沿用现有代码”，但没有列出真实枚举、状态含义、进入条件、可执行操作、退出条件、回退规则和终态。
- 影响：测试无法从 PRD 独立编写状态用例；实现者可能把“已收货”“已完成”“质检通过”等状态解释成不同业务事实。
- 修改建议：将代码中的实际枚举映射到 PRD 表格，并明确每个状态的触发事件、可执行操作、终态和禁止操作。施工状态还要明确与 `OrderLifecycle` 状态的映射。
- 待确认角色：产品、研发、测试。
- 是否阻塞研发：是。

### ~~S0-3：跨 module 事务与现金事实写入者未完全闭合~~（已解决）

- 所在位置：PRD 第 5.3 条、第 12.3 条、第 14 条和第 17 条。
- 解决结果：已确认结算 workflow 编排收款，Finance 是现金事实唯一写入者；结算收款、现金事实和结算状态同一业务事务提交，`SettlementView` 与 `FinancialDocumentQuery` 只读。
- 影响：可能出现结算已显示收款、现金事实未产生，或现金事实已产生、结算状态未更新；也会影响幂等键归属、审计记录和回归测试。
- 修改建议：实施阶段补充具体 workflow 文件和 contract test。
- 待确认角色：产品、研发、财务业务负责人。
- 是否阻塞研发：否，已不再阻塞当前设计。

## 4. 高风险问题

### S1-1：五个候选合并在一个 PRD，但缺少阶段退出条件

- 所在位置：PRD 第 8 节、第 18 节。
- 问题描述：文档规定五个候选依次实施，但没有明确每一阶段完成后是否必须评审、是否允许进入下一阶段、失败如何回退。
- 影响：可能在第一个事实 module 尚未稳定时继续迁移下游调用者，扩大回归范围。
- 修改建议：为每个阶段增加入口条件、退出条件、必须通过的 contract tests、代表页面和回滚方式。
- 是否阻塞研发：否，阻塞多阶段并行实施。
- 解决结果：已确认五阶段设置硬性阶段门；未通过 contract tests、调用者迁移、旧路径删除、回归验收或存在 S0/S1 时，不进入下一阶段。

### S1-2：每个 public interface 的输入、输出、错误和一致性约束仍不够具体

- 所在位置：第 9.2、10.2、11.2、12.2、13.2 节。
- 问题描述：当前 interface 是概念级方法列表，缺少必填输入、幂等键要求、事务要求、分页限制、错误类型、结果口径和性能特征。
- 影响：不同研发人员可能实现出不同的 interface，调用者仍需了解 implementation 细节。
- 修改建议：为每个方法补充参数字段表、结果字段表、错误表和性能/分页约束。重点补充 `receive`、`recordCollection`、`executeStep`、`searchDocuments` 和 `scopeFor`。
- 是否阻塞研发：部分阻塞，需要在任务拆分前补齐。

### S1-3：权限矩阵仍然是角色概述，不足以指导数据裁剪

- 所在位置：第 6 节、第 13.3 节及各候选验收标准。
- 问题描述：当前只列出“本人/门店/授权范围”，没有明确每个 module 的查看、新增、修改、审批、导出和跨门店规则。
- 影响：AccessContext 迁移和各 module contract tests 无法确定具体期望结果，容易出现漏权或越权。
- 修改建议：补充按 module 的权限矩阵，至少覆盖店长、销售、施工人员、财务人员、平台管理员，并列明 scopeType、资源和 action。
- 解决结果：已确认沿用现有 capability/action/scopeType/scopeIds，不新增本期权限含义；实施前仍需从代码和权限目录补出具体矩阵。
- 是否阻塞研发：否，AccessContext 阶段必须完成具体矩阵。

### ~~S1-4：历史数据和旧状态映射没有可执行方案~~（已解决）

- 所在位置：第 17 节。
- 解决结果：已确认历史数据不做破坏性迁移或事实回算，由 module 提供只读兼容映射；缺失字段进入待补齐或不可计算状态。
- 影响：迁移后历史订单、库存、财务单据和客户消费可能出现无法解释、空白或口径变化。
- 修改建议：为每个候选增加历史数据映射表：旧字段/状态、目标结果、缺失处理、是否可操作、是否需要一次性迁移。
- 是否阻塞研发：否，阻塞上线验收。

### ~~S1-5：查询规模上限和性能目标仍待确认~~（已解决）

- 所在位置：第 14 节、第 12.3 节、第 19 条第 4 项。
- 解决结果：Operational Report 继续使用 366 天/2,000 行限制；库存、采购、结算和财务沿用现有入口限制，超限返回明确错误，不静默截断。
- 影响：无法设计分页、导出、超限错误和性能测试；实时查询可能在大门店数据下退化。
- 修改建议：补充每个查询的最大日期范围、最大明细行数、分页大小、导出限制和目标响应时间；沿用已有上限时明确引用位置。
- 是否阻塞研发：否，阻塞性能验收和导出设计。

### ~~S1-6：通知、审计和非核心副作用的失败语义未闭合~~（已解决）

- 所在位置：第 14 节“外部文件或通知失败”。
- 解决结果：核心事实与审计事件同事务；通知在核心事务成功后异步执行，由 `NotificationDispatcher` 去重、重试并记录最终失败，通知失败不回滚核心事实。
- 影响：施工证据、采购收货、收款和权限拒绝等关键操作可能缺少可追溯结果。
- 修改建议：为每个候选列出审计事件、通知触发、重试次数、去重键、失败展示和补偿责任。沿用 `AuditEventWriter`、`NotificationDispatcher` 的既有约束。
- 是否阻塞研发：否，阻塞完整验收。

## 5. 一般问题与优化建议

| 编号 | 等级 | 问题 | 影响 | 修改建议 |
|---|---|---|---|---|
| S2-1 | S2 | 目标指标全部待确认 | 上线后难以判断架构深化是否有效 | 至少补充调用者直接访问 implementation 数量、重复业务规则数量和 contract test 通过率基线 |
| S2-2 | S2 | 页面范围使用通配路径 | 代表页面验收清单不明确 | 为每阶段列出具体页面和浏览器验收路径 |
| S2-3 | S2 | 财务单据类型 union 未列完整字段差异 | 可能出现弱类型结果 | 补充各 `documentType` 的必返字段和现金事实字段 |
| S2-4 | S2 | 删除测试只有原则，没有执行记录格式 | 难以判断旧路径是否真正删除 | 增加迁移前后调用者清单、删除文件/方法和验证命令 |
| S2-5 | S2 | 事务上下文如何在 interface 内传递未说明 | 可能迫使调用者传 Prisma transaction | 规定 transaction context 只能是 module 内部 implementation 细节，调用者只提交业务 command |
| S3-1 | S3 | 中英文 module 名称并存 | 文档和代码检索成本略高 | 在文档顶部增加中英文术语对照表 |
| S3-2 | S3 | 五个候选共用一个 PRD，后续任务可能过长 | 研发拆分和评审成本增加 | PRD 通过后按五个 module 生成独立实施任务或子 PRD，不重复改变业务规则 |

## 6. 业务流程评审

### 6.1 已闭合流程

- 采购需求不直接增加库存。
- 采购收货通过 `InventoryLedger` 产生库存事实。
- 施工完成不等同于最终交付。
- 客户消费概览和企业结算应收允许不同口径。
- 财务查询不替代各 workflow 写入。
- 权限上下文不依赖 HTTP。

### 6.2 未闭合流程

1. 超收和部分收货的最终分支。
2. 企业收款到现金事实的完整事务链路。
3. 施工证据纠正后的质保/售后可见性。
4. 历史状态和缺失字段进入新 module 结果的规则。
5. 通知或审计失败后的用户反馈和补偿。

已解决：撤销施工证据从当前施工视图隐藏，在质保、售后和审计追溯中保留并标记撤销；最终交付只使用当前有效质检结果。

## 7. 状态流转评审

| 对象 | 当前文档状态 | 问题 |
|---|---|---|
| 采购需求 | 草稿、已提交、已转采购单、已关闭 | 未说明取消、失效和部分转单 |
| 采购单 | 草稿、待审批、已审批、部分收货、已收货、已取消 | 超收、退货、关闭条件未定义 |
| 库存操作 | 待执行、已执行、已拒绝、已幂等返回 | 未说明并发冲突和重复请求的持久化结果 |
| 施工履约 | 待派工、已派工、施工中、待质检、质检通过、质检不通过 | 与现有实际枚举和 OrderLifecycle 映射未列出 |
| 财务单据 | 通过 documentType 区分 | 每类单据的状态集合和终态未定义 |
| 访问上下文 | 未定义状态 | 需要定义缓存失效、权限发布和旧角色兼容的生效时点 |

## 8. 权限与数据范围评审

当前角色表可以说明方向，但不能直接生成权限测试。必须补充：

- 采购单跨门店查看和审批范围。
- 库存批次和库存流水的门店/仓库范围。
- 施工证据的销售、施工人员、店长可见范围。
- 企业结算中企业成员和销售人员的可见范围。
- 财务现金事实中财务、店长和销售的字段裁剪。
- 平台管理员对历史数据和审计记录的范围。

## 9. 数据与字段评审

以下字段需要进入 PRD 字段表，而不是只存在 interface 名称中：

| Module | 必须补充的字段 |
|---|---|
| InventoryLedger | sourceType、sourceId、idempotencyKey、batchId、unit、quantity、reason、occurredAt、traceId |
| ProcurementFlow | purchaseRequirementId、purchaseOrderId、receivedQuantity、remainingQuantity、overReceiptPolicy |
| Construction Fulfillment | evidenceId、stage、recordedAt、recordedBy、supersedes/revokes relation、offlineOperationId |
| CustomerAccount | amountType、dateBasis、includedOrderKinds、generatedAt、manual/system tag source |
| SettlementView | settlementPeriod、includedOrderIds、receivable、collected、outstanding、allocationId |
| FinancialDocumentQuery | documentType、documentStatus、cashFactType、sourceType、sourceId、reversalOf、occurredAt |
| AccessContext | actorId、storeIds、capabilities、scopeType、scopeIds、resolvedAt、policyVersion |

## 10. 异常与边界评审

### 已覆盖

- 重复提交。
- 并发状态变化。
- 无权限。
- 对象不存在。
- 查询超限。
- 历史成本缺失。
- 旧入口适配。

### 需要补充

- 采购超收和负数/零数量。
- 部分收货后采购单取消或退货。
- 施工证据撤销后是否仍在售后和审计中展示。
- 客户或车辆转移期间的结算归属。
- 现金事实已产生但结算状态更新失败。
- 财务单据来源对象已删除或失效。
- 权限发布后已有页面缓存的失效时间。

## 11. 验收标准评审

### 已可直接验收

- 在途订单进入客户消费概览。
- 采购需求不增加库存。
- 重复幂等键不产生第二条库存事实。
- 施工完成不等同于最终交付。
- 无权限写操作不改变数据。
- 发票状态与现金到账分离。

### 无法直接验收

| 原描述 | 问题 | Given / When / Then 改写建议 |
|---|---|---|
| 按现有规则处理超收 | 规则未确定 | Given 采购单未收数量为 10，When 提交 12，Then 明确返回拒绝或按指定上限收货，并明确库存和采购状态 |
| 沿用现有状态枚举 | 未列出枚举和条件 | Given 原状态为 X，When 发生 Y，Then 进入 Z，并说明可执行操作和审计结果 |
| 保留已确认上限 | 没有引用具体上限 | Given 查询超过 N 天或 M 行，When 提交查询，Then 返回具体错误码和限制值 |
| 与现有权限一致 | 没有角色和 scope 组合 | Given 角色 R 访问资源 S，When 执行动作 A，Then 明确允许/拒绝及返回数据范围 |
| 失败记录或重试 | 没有重试和用户反馈规则 | Given 核心事实提交成功但通知失败，When 处理完成，Then 核心结果保持成功、通知记录失败并按规则重试 |

## 12. 风险与依赖

- 业务风险：消费概览、企业结算和财务金额口径不同，页面若不展示口径元数据可能继续误读。
- 数据风险：历史状态和成本字段不完整，不能直接按新结果计算。
- 技术风险：`InventoryService`、`ConstructionService` 和 `CustomersService` 较大，迁移范围可能超出单个迭代。
- 一致性风险：采购、结算和现金事实跨 module transaction 需要明确编排者。
- 权限风险：AccessContext 迁移可能造成漏权或越权。
- 性能风险：实时跨表查询在大门店数据规模下可能超过页面可接受时间。
- 依赖：现有 Prisma schema、OrderLifecycle、InventoryLedger、AuditEventWriter、NotificationDispatcher、权限发布机制。

## 13. 待确认事项

| 编号 | 待确认问题 | 影响范围 | 建议确认角色 | 优先级 |
|---|---|---|---|---|
| R-001 | 采购是否允许超收？超收上限、审批角色和库存处理是什么？ | ProcurementFlow、InventoryLedger | 业务/产品/研发 | P0 |
| R-002 | 现有采购、施工、财务状态的完整枚举和映射是什么？ | 全部 module、测试 | 产品/研发/测试 | P0 |
| R-003 | 企业收款的事务编排者和现金事实唯一写入者是谁？ | Settlement、Finance | 财务业务/研发 | P0 |
| R-004 | 各 module 的角色、action、scopeType 和资源范围矩阵是什么？ | AccessContext、全部调用者 | 产品/权限负责人 | P1 |
| R-005 | 各查询的日期范围、明细上限、分页大小和响应时间目标是什么？ | Reports、Finance、Inventory、Settlement | 研发/数据 | P1 |
| R-006 | 历史状态、缺失成本和删除对象如何映射到新结果？ | 数据迁移、验收 | 业务/研发/测试 | P1 |
| R-007 | 通知和审计失败是否重试、重试几次、谁处理最终失败？ | 全部写入 workflow | 研发/运营 | P1 |
| R-008 | contract test 覆盖率和重复规则减少量的目标值是什么？ | 交付验收 | 研发/测试/产品 | P2 |

## 14. 修改任务清单

| 编号 | 修改任务 | 负责人角色 | 优先级 | 是否阻塞 |
|---|---|---|---|---|
| M-001 | 决策并补充采购超收、部分收货和退货规则 | 业务/产品 | P0 | 是 |
| M-002 | 从代码提取真实状态枚举并补充状态矩阵 | 研发/测试/产品 | P0 | 是 |
| M-003 | 补充企业收款、现金事实和事务编排流程 | 财务业务/研发 | P0 | 是 |
| M-004 | 为五个 module 补充输入、输出、错误和一致性字段表 | 研发/产品 | P1 | 否，实施前必须完成 |
| M-005 | 补充按 module 的权限矩阵和资源范围 | 产品/权限负责人 | P1 | AccessContext 阶段阻塞 |
| M-006 | 补充历史数据映射和查询性能限制 | 研发/数据/测试 | P1 | 上线前阻塞 |
| M-007 | 补充通知、审计、重试和补偿规则 | 研发/运营 | P1 | 完整验收前阻塞 |
| M-008 | 为每个阶段增加入口、退出、回滚和浏览器验收清单 | 产品/研发/测试 | P2 | 否 |

## 15. 最终结论

### 是否可以进入研发

**有条件通过。可以进入任务拆分和实施前技术设计。**

### 进入研发前必须完成

1. 将代码状态的完整触发条件、退出条件和终态操作拆成 contract tests。
2. 补齐按 module 的 capability/action/scopeType/scopeIds 权限矩阵。
3. 补齐接口字段、分页限制、错误码映射和性能基线。
4. 为五个阶段生成子 PRD或研发任务包，并保留总 PRD 作为规则基线。

### 可以后续优化

- 指标目标值和重复规则基线。
- 更细的页面交互和文案。
- 独立拆分五个子 PRD或研发任务包。
- 查询性能在真实大数据量下的进一步优化。

## 16. V1.1 复审结果

### 复审范围

本次复审覆盖 PRD 新增的第 21–25 节：

- 真实状态和触发条件附录。
- 任务级权限矩阵。
- public interface 输入、输出和错误约束。
- 五阶段阶段门。
- 实施前剩余事项。

### 复审结论

**有条件通过，可以进入任务拆分和实施前技术设计；没有 S0/S1 方向性阻塞。**

已完成的关键补充：

1. 采购需求、采购单、库存分配、订单、施工记录、质检、财务单据和结算状态已经使用代码中的真实枚举。
2. 施工状态和质检结果明确为两层模型，派生阶段不新增持久化枚举。
3. 施工质检历史记录被明确列为本期新增事实表例外，解决追加式证据与“不新增事实表”的冲突。
4. 客户收款、现金事实和 Finance 唯一写入者的责任已形成完整规则。
5. 权限矩阵已落到 resource、action、scope 和 legacy behavior。
6. public interface 已补充输入、输出、幂等、错误和 transaction context 隔离规则。
7. 每个阶段已有进入条件、退出条件、回归范围和停止条件。

### 当前问题统计

| 等级 | 数量 | 处理方式 |
|---|---:|---|
| S0 | 0 | 已解决 |
| S1 | 0 | 已解决或转为阶段任务前置条件 |
| S2 | 5 | 不阻塞任务拆分，实施准备阶段补齐 |
| S3 | 2 | 后续优化 |

### S2 实施准备事项

| 编号 | 事项 | 负责人 | 影响 |
|---|---|---|---|
| V1.1-1 | 将各入口现有分页/导出限制补成具体 DTO 和测试引用 | 研发/测试 | 查询验收 |
| V1.1-2 | 确定 contract test 覆盖率和重复规则减少量基线 | 研发/测试/产品 | 效果验证 |
| V1.1-3 | 确定业务错误码到中文文案的映射表 | 产品/设计 | 页面反馈 |
| V1.1-4 | 确定代表页面浏览器验收清单 | 产品/测试 | 发布验收 |
| V1.1-5 | 为跨店施工子流程单独补充子 PRD | 产品/研发 | 跨店施工范围 |

### 复审后的进入条件

可以开始：

- 五个候选的任务拆分。
- 五份子 PRD 的编写。
- 第一阶段 Inventory/Procurement 的技术设计。
- contract test 的测试设计。

仍然不能直接开始：

- 跳过任务级字段确认直接修改业务代码。
- 在没有第一阶段阶段门记录的情况下启动第二阶段。
- 将跨店施工状态直接套用单店施工状态。
- 在没有 Finance 收款入口和幂等字段设计的情况下迁移客户收款。

### 最终评审结论

**PRD V1.1 有条件通过，允许进入任务拆分和第一阶段技术设计。完成 V1.1-1 至 V1.1-5 后，可进入正式研发实现；这些事项不改变已确认的 architecture direction。**

## 17. V1.2 复审结果

### 本轮复审范围

- 现有 DTO 的分页、导出和查询限制。
- contract test 场景覆盖目标。
- 业务错误码和中文文案映射。
- 代表页面浏览器验收清单。
- 跨店施工子流程范围和状态。
- PRD 与新增跨店施工子 PRD 的一致性。

### 复审结论

**通过，可以进入任务拆分和第一阶段研发准备。**

本轮已完成：

1. 明确 Operational Report 的 366 天/2,000 行限制。
2. 明确 Finance `pageSize` 最大 100，并记录 Inventory、Purchase、Settlement 当前无统一分页入口的事实和风险。
3. 明确 contract test 必须覆盖场景矩阵 100%，不以单一代码覆盖率替代行为测试。
4. 补充业务错误码到中文文案和页面处理方式。
5. 补充五阶段代表页面的浏览器验收清单。
6. 新增 [跨店施工履约子 PRD](D:/workSpace/mallbay/docs/features/construction-cross-store-fulfillment-prd.md)，明确跨店状态不等同源门店最终交付。
7. 将跨店施工从通用单店施工状态中隔离，避免状态解释冲突。

### 当前问题统计

| 等级 | 数量 | 结论 |
|---|---:|---|
| S0 | 0 | 无阻塞 |
| S1 | 0 | 无高风险未决策项 |
| S2 | 0 | 本轮已补充或转为明确的后续性能任务 |
| S3 | 2 | 指标可视化和文案细化，可后续优化 |

### 仍需在研发任务中执行但不阻塞评审

- 按现有 DTO 和入口补充具体测试引用。
- 按页面清单执行浏览器验收。
- 为各 module 创建 contract test 文件和场景矩阵。
- 将旧入口逐步适配到 public interface。
- 在真实数据规模下评估 Inventory、Purchase、Settlement 的分页需求。

### 最终结论

**PRD V1.2 评审通过，可以进入五个候选的任务拆分；实施顺序仍为 Inventory/Procurement → Construction Fulfillment → Customer/Settlement → FinancialDocumentQuery → AccessContext。**

## 18. 实施启动复核

实施启动后确认的代码事实：

- `ProcurementFlow` 已收口采购需求、采购单、审批、取消、收货和批量收货入口；收货的库存事实与采购状态仍由现有事务实现保持原子提交。
- `ConstructionFulfillment` 已收口派工、开工、完工、施工证据、质检、材料、离线同步和跨店验收入口；容量、人员、请假等管理能力暂不越界进入履约模块。
- `CustomerAccount`、`SettlementView`、`FinancialDocument`、`AccessContext` 已有基础 seam，但仍标记为进行中，不能被误判为阶段完成。
- API 类型检查和全量 API 测试通过；当前测试结果为 413 通过、0 失败。

本轮没有新增 S0/S1。阶段门仍未通过，原因是旧事实实现尚未删除、库存/施工追加历史和各 module 场景矩阵仍需补齐；下一步继续在阶段一完成事务/契约测试后，才能进入阶段二正式验收。

## 19. 五候选实施进展复核

本轮实施已验证：

1. `InventoryLedger` 已覆盖库存批次、流水、预留、收货、出库、调整、库存匹配和追溯查询；`InventoryController`、`PurchasesController` 的采购/库存事实入口已迁移。
2. `ConstructionFulfillment` 已覆盖派工、开工、完工、证据、质检、材料、离线和跨店验收；新增 `ConstructionQualityHistory` 追加表和质量历史读取接口。
3. `SettlementWorkflow` 已接管结算写操作；客户收款和红冲持久化业务幂等键，`PaymentRecord` 现金事实通过 `FinanceService` 在同一事务内写入。
4. `FinancialDocumentQuery` 已覆盖费用、报销、发票、返利、提成和现金事实的只读入口，来源追溯保留既有返回兼容性。
5. `AccessContext` 新增明确上下文、决策和 `require` 接口，报表控制器已迁移，HTTP filter 可保留 `ACCESS_DENIED` 业务码。

验证结果（当时记录）：API 类型检查通过；API 全量测试 418 通过、0 失败。当前结果以第 21 节为准。

### 当时仍未通过阶段门的事项（已由第 21 节更新）

- 兼容 implementation 尚未完全删除，仍需执行旧路径扫描和删除测试。
- 质检历史已落 schema 和代码，但尚未完成真实数据库 migration 应用及浏览器代表页验收。
- Finance/Settlement、Inventory、Construction 的完整场景矩阵和并发数据库测试仍需补齐。
- AccessContext 尚未迁移所有核心 service 内部的 `PermissionPolicy` 解析。
- Web 类型检查、构建和 1440/1024/390 浏览器验收尚未完成。

## 20. 评审建议跟进复核

本轮针对上一轮提出的“契约测试补齐、兼容注入回归、构建验证”继续收口（当时记录，当前状态以第 21 节为准）：

1. `InventoryLedger` 已补齐 reserve、release、receive、批量收货、outbound、adjust 六类命令的 public seam contract test，并保留批次、流水、匹配和追溯查询测试。
2. `CustomersController` 的 `CustomerAccount` 兼容注入调整曾引入 TypeScript 参数顺序错误，已修复；API Nest build 通过。
3. 客户控制器、客户服务、结算服务、五候选 module contract、AccessContext 和异常适配器定向回归测试共 28 项通过，0 失败；库存/采购、数据库不变量和深模块契约定向回归共 18 项通过，0 失败。
4. 本轮没有改变 API、权限、订单状态、金额口径或历史数据含义，也没有新增双写路径。

### 本轮结论

本轮评审建议已转化为代码和测试补强，没有新增 S0/S1。五个候选仍不能标记为全部完成；当时剩余的数据库、并发、构建和当前视口浏览器证据已在第 21 节完成更新，仍需继续处理旧兼容实现删除扫描和三档视口验收。

该段为历史阶段记录；当前阶段门状态以第 21 节为准，不得因定向测试通过提前宣告全量架构深化完成。

## 21. 阶段门跟进复核（2026-08-09）

### 本轮完成的收口

1. Inventory/Procurement 的调用者边界继续收窄：`InventoryController` 和 `PurchasesController` 不再直接依赖 `InventoryService`；库存事实由 `InventoryLedger`、采购流程由 `ProcurementFlow`、仓库/供应商主数据由 `InventoryCatalog` 对外提供。`InventoryService` 已从 InventoryModule 的公开 exports 移除。
2. Construction 的公开边界继续收窄：履约与跨店验收通过 `ConstructionFulfillment` 暴露；`ConstructionService` 和 `CrossStoreConstructionService` 不再由 ConstructionModule 对外导出。核心施工、跨店、照片、材料和质检授权已接入 `AccessContext`。
3. Customer/Settlement 的结算读写边界继续收窄：`SettlementView` 和 `SettlementWorkflow` 对外提供结算能力，`CustomerSettlementsService` 从 module exports 移除；结算核心授权已接入 `AccessContext`。
4. FinancialDocumentQuery 继续作为财务只读入口：FinanceQueryService、FinanceService、ReportsService 的核心授权已接入 `AccessContext`；FinanceModule 不再公开 FinanceQueryService，ReportsModule 不再导出 ReportsService。
5. 兼容权限解析仍仅作为内部回退或派生数据范围实现保留；本轮没有新增调用者依赖 legacy policy，也没有新增事实双写。
6. 新增 module deletion regression：验证 InventoryService、ConstructionService、CrossStoreConstructionService、CustomerSettlementsService、FinanceQueryService、ReportsService 均未重新进入对应 module 的公开 exports，测试通过。
7. 修复报表页的真实响应式缺口：六类分析视图均渲染桌面表格和移动卡片 fallback，桌面表格具备横向滚动容器；Web feature tests 609/609 通过。
8. 修正客户消费概览的事实集合一致性：订单数、消费趋势和金额聚合统一纳入在途订单、排除取消订单；新增详情聚合条件回归断言，客户服务测试 17/17 通过。
9. 完成旧服务生产引用扫描：Inventory、采购、结算、财务查询的旧实现仅保留在模块内部适配层；施工控制器对旧 ConstructionService/CrossStoreConstructionService 的引用仅覆盖容量、人员、请假、排班和跨店管理端点，不属于履约 public seam；未发现新的跨模块调用者。

### 自动化验证结果

| 验证项 | 结果 |
|---|---|
| API 全量测试 | 422 通过、0 失败 |
| API Nest build | 通过 |
| Web TypeScript check | 通过 |
| Web production build | 通过，75 个 App Router 页面生成成功 |
| Web feature tests | 609 通过、0 失败 |
| Prisma migration status | 61 个 migration 已应用，schema up to date |
| 数据库不变量预检 | 通过 |
| 真实 PostgreSQL 并发回归 | 2/2 通过：库存流水幂等、施工容量防超卖 |
| 登录态代表页面 | 5/5 页面无应用错误和横向溢出（当前视口 1707×1067） |
| API/Web 现有业务行为 | 未改变 API、权限、订单状态和历史数据含义；客户消费金额现与订单数/趋势统一排除取消单并保留在途单 |

### 剩余未通过的阶段门

- 兼容实现删除扫描：当前仍保留部分旧 service 作为内部事实实现，尚未达到“删除旧路径后测试仍通过”的条件。
- 浏览器代表页面：已在已登录会话检查 `/inventory`、`/construction/tasks`、`/customers`、`/finance`、`/reports`，均无应用错误和横向溢出；`/reports` 返回真实空数据态。当前视口 1707×1067，仍需补齐 1440/1024/390 三档验收。

### 本轮结论

没有新增 S0/S1，也没有发现 public interface 需要重新设计的问题。数据库、API 和代表页面的当前视口验收已恢复并通过；五阶段仍不能宣布完成，剩余阶段门集中在兼容实现删除扫描、全量旧路径删除测试，以及 1440/1024/390 三档浏览器验收。

## 22. 按评审建议继续优化（2026-08-09）

### 22.1 本轮处理的问题

1. **公共接口不再推导旧 service 参数**：`InventoryLedger`、`CustomerAccount`、`SettlementView` 已改用显式 actor 和 DTO 类型；`ConstructionFulfillment`、`FinancialDocumentQuery`、`AccessContext` 保持显式领域输入/输出。
2. **施工履约接口不再停留在适配层**：新增 `GET /construction/orders/:orderId/fulfillment` 和 `GET /construction/fulfillments`，由 `ConstructionFulfillment` 返回订单上下文、施工记录、照片、履约阶段、能力/阻塞信息和稳定列表摘要，并统一日期序列化。
3. **真实调用者完成迁移**：现场施工任务详情、施工订单详情改为按订单读取履约视图；现场任务列表改为读取履约列表视图，不再知道 assignment 列表如何过滤或如何按订单关联详情。
4. **删除后回归证据增强**：保留 module exports 删除回归，并补充公共 seam 的类型边界检查；没有新增旧 service 跨模块调用者。施工管理端点仍使用旧 service，但范围限定为容量、人员、请假、排班和跨店管理，不属于订单履约 public seam。

### 22.2 验证结果

| 验证项 | 结果 |
|---|---|
| API 类型检查 | 通过 |
| API 全量测试 | 424 通过、0 失败、2 个 opt-in 真实数据库测试跳过 |
| API 履约契约测试 | 10 通过、0 失败；覆盖订单视图、履约列表、生命周期和证据/离线公开入口 |
| Web 类型检查 | 通过 |
| Web production build | 通过；75 个 App Router 页面生成成功 |
| Web feature tests | 613 通过、0 失败 |
| 履约视图契约测试 | 通过；验证日期、照片、施工状态、派生阶段、列表摘要和执行门店回退 |
| 页面迁移 | 施工任务详情、施工订单详情和现场任务列表已使用履约视图接口；工作台当前为待派工数量 KPI，不拼装施工阶段 |

### 22.3 重新检查四个架构问题

- **是否只是增加一层 abstraction**：不是。履约视图已经替换页面原有的全量列表查询和客户端拼装；显式 DTO 也切断了调用者对旧 service 参数签名的依赖。
- **是否减少调用者知识**：是。现场页面不再知道 assignment 列表如何过滤、如何按订单关联施工记录；只消费订单履约视图。
- **删除新模块后复杂度是否散落**：契约测试固定了视图字段和阶段计算；删除 `ConstructionFulfillment` 后，页面必须重新承担查询、日期序列化和阶段拼装，因此复杂度不会无痕回散。
- **public interface 是否比 implementation 简单**：是。公共接口仅暴露视图、能力、受限 command 和明确 DTO；Prisma 查询、授权回退、兼容 service 委托和序列化隐藏在 module 内部。

### 22.4 当前仍未通过的阶段门

本轮没有新增 S0/S1，但以下事项仍不能标记完成：

- 旧兼容事实实现尚未完成“删除后全量回归”；当前只能证明模块不再公开导出旧实现、且没有新的跨模块调用者。
- 代表页面仍缺少 1440、1024、390 三档可控浏览器验收证据；已有 1707×1067 登录态检查不能替代三档结果。
- 本轮尝试连接已登录 Chrome 并重试一次仍不可用，因此没有伪造三档浏览器结果；需要浏览器扩展连接恢复后再补证据。
- 工作台仍未增加订单级履约状态面板；现有待派工 KPI 读取的是待派工订单数量，不存在施工阶段客户端拼装，后续若增加履约明细需直接接入 `ConstructionFulfillment`。

## 23. 权限缓存与企业结算投影复核（2026-08-10）

### 本轮已解决

1. `PermissionsService` 的缓存失效不再只清理数据库结果缓存：用户级绑定变更会清理对应 `PermissionPolicy` 运行时快照，角色停用、策略发布和策略回滚会清理全部运行时快照。这样兼容授权桥不会在 30 秒缓存窗口内继续使用旧的角色或能力。
2. 新增用户级权限变更回归测试，验证绑定停用后运行时快照被移除，legacy policy 的同门店回退能力仍保持不变。
3. `SettlementView` 从直接委托旧 service 数组改为显式只读投影，返回 `items`、`semantics` 和 `generatedAt`；对账单逐项返回期间、纳入订单、应收、已收、待收及对账明细 ID，避免调用者自行解释金额和分摊关系。
4. 企业结算 Web 页面已迁移到投影 `items`，并展示服务端生成的对账口径说明；没有新增写入或前端金额计算。

### 评审判断

- **是否只是增加一层 abstraction**：权限部分不是，补齐了缓存副作用的一致性；结算部分不是，原始对账单到对外语义投影的转换和日期序列化集中到 module 内部。
- **是否减少调用者知识**：是。页面不再假设结算接口返回裸数组，也不再自行推断订单纳入范围和金额字段含义。
- **删除新模块后复杂度是否回散**：是可验证的。删除 `SettlementView` 后调用者必须重新处理日期、逐单明细和金额语义；删除权限失效桥后会重新出现运行时快照残留风险。
- **public interface 是否比 implementation 简单**：是。投影只暴露业务金额、期间和分摊标识，Prisma include、旧 service 适配和兼容权限缓存细节仍隐藏在 module 内部。

### 自动化验证

| 验证项 | 结果 |
|---|---|
| API 全量测试 | 425 通过、0 失败、2 个 opt-in 真实数据库测试跳过 |
| API 深模块契约 | 10 通过、0 失败；含结算投影语义和履约公开入口 |
| API/Web 类型检查 | 通过 |
| Web feature tests | 614 通过、0 失败 |

### 仍需补齐

- 权限发布/回滚的完整策略版本、并发冲突、缓存失效和审计场景矩阵。
- `SettlementView` 候选订单与收款列表的统一语义元数据；当前已先完成对账单主投影。
- 旧兼容 implementation 删除后的全量回归，以及 1440/1024/390 三档可控浏览器证据。

本轮没有新增 S0/S1；阶段门继续保持未完成。

## 24. SettlementView 三类读查询复核（2026-08-10）

### 本轮已解决

1. 候选订单查询现在返回 `items`、`semantics` 和 `generatedAt`，明确按订单创建时间、已完成/已质保订单以及订单应收/已收/待收金额解释。
2. 对账单查询保留逐单 `settlement` 投影，明确结算期间、纳入订单 ID、应收/已收/待收和对账明细 ID。
3. 收款查询现在返回 `items`、`semantics` 和 `generatedAt`，明确按收款时间、收款金额、订单收款分摊和红冲金额解释；保留红冲记录和逐单分摊，不把收款事实与订单消费概览混为一谈。
4. Web 企业结算页面已迁移三类列表的 `items` 消费，页面不再依赖任何裸数组响应。

### 自动化验证

- API 类型检查通过。
- API 深模块契约测试 10/10 通过，覆盖对账单和候选订单语义投影。
- Web 类型检查通过。
- Web 结算 API contract tests 3/3 通过，覆盖对账单、候选订单、收款/红冲语义。

### 评审结论

`SettlementView` 的只读查询 contract 已达到 PRD 要求：调用者可以直接使用服务端提供的日期、订单范围、金额分类和分摊语义，无需读取旧 service 或自行推断字段含义。本轮没有新增 S0/S1。CST-002 可标记完成；CST-004 的其他财务 workflow 现金事实写入、旧实现删除和三档浏览器验收仍需继续。

## 25. AccessContext 权限生命周期复核（2026-08-10）

### 本轮已解决

- 权限绑定停用清理指定用户缓存，角色停用清理全量缓存。
- 已校验策略发布和策略回滚均清理权限结果缓存以及 `PermissionPolicy` 兼容运行时快照。
- 新增四类权限生命周期回归：用户级、全局、发布、回滚；验证权限变更不会继续复用旧角色和能力快照。

### 自动化验证

- 权限服务定向测试 8/8 通过。
- API 类型检查和既有 API 全量回归继续通过。

### 评审结论

ACC-002 已达到 PRD 要求，可标记完成。该修复只收口缓存副作用，不扩大 `AccessContext` public interface，也不改变既有权限结果或策略版本语义。ACC-003/ACC-005 的调用者迁移和 legacy 回退删除仍未完成。

### 当前全量验证记录（2026-08-10）

- API 全量测试 429/429 通过，0 失败，2 个 opt-in 真实数据库测试跳过。
- API 类型检查、API Nest build、Web 类型检查、Web production build 均通过；Web 生成 75 个 App Router 页面。
- Web feature tests 616/616 通过。
- 本轮仍缺少 1440/1024/390 可控浏览器证据，且没有执行旧兼容 implementation 删除后的全量回归。

## 27. ConstructionFulfillment 访问上下文收口复核（2026-08-10）

### 本轮已解决

- `ConstructionFulfillment` public seam 不再直接引用或回退到 `PermissionPolicy`。
- 履约视图现在必须通过注入的 `AccessContext` 判断执行门店或订单归属门店的读取权限；未配置访问实现时显式失败，不静默放行。
- 施工管理旧 service 的兼容授权逻辑仍仅限内部管理端点，未重新暴露为履约模块的调用者依赖。

### 自动化验证

- API 深模块契约测试 10/10 通过，覆盖履约视图、列表和财务查询等公开 seam。
- API 全量测试 429/429 通过，2 个 opt-in 真实数据库测试按默认配置跳过；Web feature tests 616/616 通过，Web 类型检查通过。
- `git diff --check` 通过。

### 评审判断

本轮没有新增 S0/S1。该修改真实减少了履约调用者对 legacy 权限实现的知识依赖，但不等同于 ACC-003/ACC-005 全部完成；施工管理内部兼容层、其他业务 module 的 legacy 回退、旧实现删除后的全量回归仍需继续。

## 26. FinancialDocumentQuery 与返利现金事实复核（2026-08-10）

### 本轮已解决

1. `FinancialDocumentQuery` 作为 public read seam 不再直接引用 `PermissionPolicy`，权限判断统一通过已注入的 `AccessContext`；其内部 `FinanceQueryService` 也已移除授权 fallback，所有财务文档查询必须经过同一授权 seam。
2. 返利发放的实际 Nest 路径改为在返利状态、返利日志和现金事实同一事务中调用 `FinanceService.recordRebatePayout`。
3. Finance writer 为返利现金事实生成稳定幂等键 `rebate:{rebateId}:paid`；返利支付现在必须通过 Finance writer，未配置 writer 时显式失败，不再保留直接写表 fallback。

### 自动化验证

- API 类型检查通过。
- 返利服务定向测试通过，覆盖 Finance 委托和未配置 writer 的显式失败。
- API 深模块契约测试 10/10 通过。

### 评审判断

- public 财务查询 seam 的实现比之前更简单，调用者不再知道 legacy policy。
- 返利写入已减少一个跨 module 直接写 `PaymentRecord` 的生产路径；事务和幂等责任集中到 Finance。
- 返利 direct-write fallback 已删除；报销支付也已完成同样收口。FIN-003 仍需完成发票/提成 workflow 的场景审计与查询矩阵，ACC-005 仍需完成其余旧实现删除后的回归。

本轮没有新增 S0/S1。

## 30. FinanceQueryService legacy authorization 删除复核（2026-08-10）

### 本轮已解决

- `FinanceQueryService` 构造函数改为强制注入 `AccessContext`，删除缺少上下文时调用 `PermissionPolicy` 的兼容分支。
- `FinancialDocumentQuery` 仍负责对外只读边界，`FinanceQueryService` 仅作为其内部查询实现；现在两者共享同一 capability/action/store/owner 授权语义。
- 原有“本人范围、全量范围、当前门店、忽略过期 JWT 门店成员信息、跨门店拒绝”行为均保留，并由定向回归锁定。

### 自动化验证

- FinanceQueryService 与财务 workflow 定向测试 8/8 通过。
- API 类型检查通过；FinanceQueryService 生产代码不再引用 `PermissionPolicy`。

### 评审判断

本轮没有新增 S0/S1。该变更实际删除了一条 legacy authorization 路径，而不是增加一层无效 abstraction；删除 `FinanceQueryService` 的 fallback 后，调用者仍只需要知道 `FinancialDocumentQuery`/`AccessContext` 的公共契约。其余财务 workflow、发票规则和旧 service 删除后的全量回归仍需继续。

## 31. 全量回归与浏览器阶段门复核（2026-08-10）

- API 全量测试 431 个：429 通过、0 失败、2 个 opt-in 真实数据库并发测试按默认配置跳过；API 类型检查和 Nest build 通过。
- Web 全量测试 616/616 通过；Web 类型检查和 production build 通过，成功生成 75 个 App Router 页面。
- 受控页面导航只能到达 `/auth`，Chrome 已登录会话连接重试也不可用，本轮未取得可信的 1440/1024/390 浏览器证据。
- 旧实现删除后的全量回归仍未完成，因此五候选总体保持实施中，不提前标记完成。

## 29. ReportsService public authorization 收口复核（2026-08-10）

### 本轮已解决

- `ReportsService` 的 public authorization seam 现在强制依赖 `AccessContext`，不再在缺少上下文时静默回退到 `PermissionPolicy`。
- 报表读取、门店范围校验和报表导出入口继续保持原有返回结构、指标口径和 HTTP 路径；本次只收口调用者不应知道的授权实现细节。
- `PermissionPolicy` 仍仅用于 ReportsService 内部销售人员范围派生，不属于 public authorization fallback；该内部范围模型列入 ACC-003 的后续迁移任务。

### 自动化验证

- ReportsService 定向测试 9/9 通过，覆盖允许访问与拒绝访问路径。
- API 全量测试 429 通过、0 失败、2 个 opt-in 真实数据库测试跳过；API 类型检查和 Nest build 通过。

### 评审判断

本轮没有新增 S0/S1。ReportsService 的 public interface 已比 implementation 简单，删除其授权 fallback 不会改变业务数据含义；但内部销售范围派生、其他 legacy caller 删除后的全量回归，以及 1440/1024/390 浏览器验收仍未完成，ACC-003/ACC-005 和五阶段总体不能标记完成。

## 28. FIN-003 报销/返利现金事实与提成权限复核（2026-08-10）

### 本轮已解决

- `ReimbursementWorkflowService.pay` 的报销状态、审批日志和 `REIMBURSEMENT` 现金事实在同一事务中完成；现金事实只由 `FinanceService.recordReimbursementPayout` 写入，幂等键为 `reimbursement:{id}:paid`。
- `FinanceService.approveReimbursement` 迁移入口不再直接创建现金事实；审批动作委托给 `ReimbursementWorkflowService`，付款必须使用专用支付 workflow。
- `RebatesService.pay` 删除无 Finance 注入时的直接 `PaymentRecord` fallback；返利现金事实强制经 `FinanceService.recordRebatePayout`。
- `CommissionsService` 改为强制依赖 `AccessContext`，不再引用 `PermissionPolicy`，其 capability 为 `commissions/write`。

### 自动化验证

- Finance/Reimbursement/Rebate 相关定向测试 17/17 通过；提成测试 2/2 通过。
- API 类型检查通过；PaymentRecord 扫描确认报销和返利生产路径只剩 Finance writer 的 `paymentRecord.create`。

### 评审判断

本轮没有新增 S0/S1。FIN-003 已完成报销和返利现金事实写入收口，但发票/提成的业务写入审计与 FinancialDocumentQuery 场景矩阵、旧实现删除后的全量回归、三档浏览器验收仍需继续；ACC-003/ACC-005 仍未全部完成。

## 33. FinanceService 与 FinanceAttachmentService 权限边界复核（2026-08-10）

### 本轮已解决

- `FinanceService` 的 legacy 方法删除 `PermissionPolicy` fallback；需要授权的调用在缺少 `AccessContext` 时显式失败，现金事实 writer 仍可由已打开事务的内部 workflow 使用。
- `FinanceAttachmentService` 改为通过 `AccessContext` 判断申请人 owner 访问或财务门店范围访问，不再直接解析 legacy policy。
- 报销审批、付款等仍保留细粒度角色差异，暂不强行迁移到过于粗粒度的 `finance/write`，避免把店长审批或付款权限扩大；该差异待 capability matrix 固化后再迁移。

### 自动化验证

- FinanceAttachment、FinanceQuery、FinanceService 和 finance workflow 定向测试 14/14 通过。
- API 全量测试 434 个：432 通过、0 失败、2 个 opt-in 真实数据库并发测试跳过；API 类型检查通过。

### 评审判断

本轮没有新增 S0/S1。FinanceService 的 fallback 删除和附件入口迁移真实减少了调用者对 legacy policy 的依赖；报销 workflow 等剩余权限差异已明确记录为能力矩阵问题，而不是用错误的通用能力替代。ACC-003/ACC-005、FIN-003 及浏览器/删除阶段门仍未全部完成。

## 34. 财务 workflow capability matrix 评审结论（2026-08-10）

已确认后续迁移采用细粒度能力，不把报销审批和付款继续复用为同一个 `finance/write`：

| 动作 | capability/action/scope | 角色边界 |
|---|---|---|
| 发起费用/报销 | `finance.application/submit/OWN` | 当前门店成员，仅本人 owner |
| 查看本人单据 | `finance.document/read/OWN` | 当前门店成员，仅本人 |
| 查看全店单据/流水 | `finance.document/read/STORE` | 店长、财务；总部审核员为 GLOBAL |
| 审批费用 | `finance.expense/review/STORE` | 店长；总部审核员为 GLOBAL |
| 审批报销 | `finance.reimbursement/review/STORE` | 财务；总部审核员为 GLOBAL |
| 支付报销 | `finance.reimbursement/pay/STORE` | 财务；总部审核员为 GLOBAL |
| 上传附件 | `finance.document/attach/OWN` 或 `STORE` | 申请人本人；店长/财务可按门店范围上传 |

迁移要求：新 capability 必须进入权限目录、legacy role 映射和可发布矩阵；自定义角色未配置时默认拒绝，不回退到更宽的 `finance/write`。迁移回归必须覆盖店长、财务、销售、采购、施工、客服和总部审核员，特别锁定“店长不可支付报销、销售不可查看全店财务”。

本节解决了此前评审中的权限矩阵阻塞项；代码迁移和旧 `PermissionPolicy` 删除仍待执行，暂不宣告 FIN-003/ACC-003/ACC-005 完成。

## 35. 财务 capability matrix 实施复核（2026-08-10）

### 本轮已解决

- `ExpenseWorkflowService`、`ReimbursementWorkflowService`、`FinanceQueryService`、`FinanceAttachmentService` 和 `FinanceService` 均通过 `AccessContext` 使用细粒度 capability/action/scope，不再在财务目录中引用 `PermissionPolicy`。
- 已新增并部署 `20260810120000_finance_capability_matrix` migration，建立 `finance.application`、`finance.document`、`finance.expense`、`finance.reimbursement` 权限定义及 HQ、店长、财务、销售、采购、排班、施工、客服、学徒角色授权。
- 新 workflow 保持“店长可审批费用但不可审批/支付报销；财务可审批/支付报销；普通门店成员仅本人提交、查看和上传；自定义角色未配置新能力时默认拒绝”的边界。
- workflow 测试构造器已显式注入 `AccessContext`，避免测试继续掩盖缺少授权上下文的问题。

### 自动化验证

- 财务 workflow、查询、附件、FinanceService、权限矩阵和现金事实闭环定向测试 31/31 通过。
- API 全量测试 435 个：433 通过、0 失败、2 个 opt-in 真实数据库并发测试按默认配置跳过。
- API TypeScript 检查、Nest build 和 `git diff --check` 通过。
- `rg` 扫描确认 `apps/api/src/finance` 不再包含 `PermissionPolicy` 引用。

### 评审判断

本轮 capability matrix 阻塞项已解决，没有新增 S0/S1。该迁移实际删除了财务 workflow 对 legacy policy 的依赖，并将角色差异固化为可发布权限数据；没有把原有审批/支付权限扩大为通用 `finance/write`。FIN-003 的报销现金事实和财务权限子项可标记为完成。

ACC-003/ACC-005 仍不能整体标记完成：Reports 内部销售范围、其他核心 callers 的 legacy implementation 删除、删除后的回归以及 1440/1024/390 浏览器验收仍是剩余阶段门。

## 36. ReportsService 销售范围 implementation 收口复核（2026-08-10）

### 本轮已解决

- ReportsService 的销售角色判断改由 `AccessContext.resolve()` 返回的角色和门店范围完成，删除内部 `PermissionPolicy.hasRuntimeSnapshot/hasRuntimeRole` 依赖。
- 报表入口继续使用 `reports/read` 做访问校验；销售角色补齐 `reports/read/STORE` 入口授权，但查询 scope 仍强制注入当前销售人员 `salesPersonId`，因此不会扩大到全店数据。
- 新增 `20260810130000_sales_report_access` migration，保证无显式绑定的 legacy 销售用户也能进入报表并保留本人数据边界。
- ReportsService 测试 fake 改为显式提供 `can` 和 `resolve`，不再通过缺少实现的 mock 掩盖模块依赖。

### 自动化验证

- ReportsService 与权限矩阵定向测试 18/18 通过。
- API 全量测试 435 个：433 通过、0 失败、2 个 opt-in 真实数据库并发测试按默认配置跳过。
- API TypeScript 检查、Nest build 和 `apps/api/src/reports`、`apps/api/src/finance` 的 `PermissionPolicy` 扫描均通过。

### 评审判断

本轮没有新增 S0/S1。ReportsService 的 public authorization 和内部销售范围均已通过 `AccessContext` 收口，入口权限和数据 scope 分离，满足“删除新模块后复杂度不会重新散落”的约束。ACC-003 的 Reports 子项完成；ACC-003/ACC-005 仍需继续迁移其他核心 callers、删除剩余 legacy implementation 并完成浏览器三档验收。

## 37. CustomerSettlementsService 权限 fallback 收口复核（2026-08-10）

### 本轮已解决

- `CustomerSettlementsService` 改为强制注入 `AccessContext`，删除缺少上下文时回退 `PermissionPolicy` 的兼容路径。
- 现有客户读取仍使用 `customers/read`，店长/财务结算写操作仍使用 `finance/write`；本轮没有扩大权限，也没有改变结算单、收款、红冲、对账期间和幂等语义。
- `PermissionsModule` 已是 CustomerSettlementsModule 的显式依赖，Nest 运行时不再允许缺失授权实现时静默进入业务逻辑。

### 自动化验证

- API TypeScript 检查通过。
- API 全量测试 435 个：433 通过、0 失败、2 个 opt-in 真实数据库并发测试按默认配置跳过。
- 客户结算目录不再包含 `PermissionPolicy` 引用；`git diff --check` 通过。

### 评审判断

本轮没有新增 S0/S1。客户企业结算的授权实现已进一步收口，public settlement seams 无需知道 legacy policy；CST-004 的权限 fallback 子项完成。ACC-003/ACC-005 仍需继续处理发票、订单、库存、施工等其他核心 callers，并完成删除后回归和浏览器三档验收。

## 38. 发票、返利与产品目录权限迁移复核（2026-08-10）

### 本轮已解决

- `InvoicesService` 和 `FinancialDocumentQuery` 的发票列表 scope 改由 `AccessContext` 判断；销售仍只能申请本人销售订单的发票并查看本人发票，店长/财务管理范围保持不变。
- `RebatesService` 的返利申请、业务审核、财务审批、支付和销售列表 scope 改由 `AccessContext` 判断；Finance writer 现金事实路径保持不变。
- `ProductsService` 改为强制使用 `AccessContext`，产品读取、产品管理、店长建议价和财务/店长标准成本边界保持不变。
- 产品权限定义和角色 grant 已新增并部署 `20260810140000_products_access` migration。

### 自动化验证

- 发票与财务查询定向测试 19/19 通过；返利定向测试 10/10 通过；产品定向测试 5/5 通过。
- API 全量测试 435 个：433 通过、0 失败、2 个 opt-in 真实数据库并发测试按默认配置跳过。
- API TypeScript 检查、Nest build 前置检查和 `git diff --check` 通过。

### 评审判断

本轮没有新增 S0/S1。发票、返利、产品模块已减少对 legacy policy 的直接依赖，且销售本人 scope 与财务写入边界由测试锁定。ACC-003/ACC-005 仍需继续处理订单、库存、施工、售后、定价等 caller，以及删除后回归和浏览器三档验收。

## 39. InventoryService 权限迁移复核（2026-08-10）

### 本轮已解决

- `InventoryService` 改为强制注入 `AccessContext`，库存批次、库存流水、门店仓库、采购需求、采购单、供应商和入库/出库操作均通过统一 capability/action/scope 入口授权。
- 库存与采购读写边界保持不变：店长和采购可维护库存采购事实，客服按门店读取采购关联信息但不能写入，财务按既有范围读取，销售不能读取采购后台数据；所有写操作继续限定当前门店。
- 删除了库存服务在缺少授权上下文时的隐式兼容路径；测试构造器全部显式注入访问上下文，避免 mock 缺失时静默放行。

### 自动化验证

- InventoryService 定向测试 42/42 通过，覆盖库存读取/写入、采购读取/写入、销售拒绝、客服只读、入库批次、单位换算、幂等和出库行为。
- API 全量测试 435 个：433 通过、0 失败、2 个 opt-in 真实数据库并发测试按默认配置跳过。
- API TypeScript 检查通过；库存目录不再引用 `PermissionPolicy`。

### 评审判断

本轮没有新增 S0/S1。库存和采购事实的调用者已依赖稳定的访问上下文，模块 public 行为与业务事实未改变，满足“删除新模块后复杂度不会重新散落”的迁移要求。库存属于 ACC-003/ACC-005 的核心 caller 迁移子项，可标记为完成；订单履约、施工、售后、定价以及 legacy implementation 删除后的全量回归和浏览器三档验收仍是剩余阶段门。

## 40. WarrantiesService 权限迁移复核（2026-08-10）

### 本轮已解决

- `WarrantiesService` 的质保创建、列表和详情访问改由 `AccessContext` 判断，模块显式依赖 `PermissionsModule`，删除了质保服务对 `PermissionPolicy` 的直接调用。
- 质保创建仍限定店长、排班员和客服等原有可建卡角色，列表/详情保留当前门店范围，销售列表和详情继续只返回本人订单的质保记录。
- 新增并部署 `20260810150000_warranties_access` migration，权限目录、角色 grant 和 legacy 初始化脚本保持一致；公开质保查询 `lookup` 行为不变。

### 自动化验证

- WarrantiesService 定向测试 7/7 通过，覆盖创建、幂等、列表 scope、销售越权拒绝和审计事件读取。
- API TypeScript 检查和 Nest build 通过。

### 评审判断

本轮没有新增 S0/S1。质保模块的权限 implementation 已收口到稳定访问上下文，销售本人 scope 仍由服务层显式约束；质保属于履约后置 caller 的迁移子项，可标记为完成。售后、订单生命周期、施工和定价 caller 以及删除 legacy implementation 后的全量回归仍待完成。

## 41. AfterSalesService 权限迁移复核（2026-08-10）

### 本轮已解决

- `AfterSalesService` 的售后创建、派单、责任判定、关闭、列表、详情、施工证据和照片上传访问均改由 `AccessContext` 及实体派单关系判断，删除生产代码中的 `PermissionPolicy` 依赖。
- 销售仍只能读取本人订单售后，施工员/学徒仍只能处理本人已派单任务；店长、排班员和客服保留售后管理边界；售后成本继续区分店长运营成本与财务退款/供应商追偿成本。
- 新增并部署 `20260810160000_after_sales_access` migration，补齐售后角色 capability/action/scope，尤其补齐排班员门店写入和施工员/学徒本人写入。

### 自动化验证

- AfterSalesService 定向测试 10/10 通过，覆盖售后生命周期、销售/施工范围、证据照片、财务成本和红冲。
- API 全量测试 435 个：433 通过、0 失败、2 个 opt-in 真实数据库并发测试按默认配置跳过。
- API TypeScript 检查通过；售后生产代码不再引用 `PermissionPolicy`。

### 评审判断

本轮没有新增 S0/S1。售后模块已把授权决策与数据 scope 分开：capability 决定能否进入动作，销售/施工关系决定可见实体，成本类别再决定财务角色；没有把原有财务边界简化成通用写权限。售后 caller 迁移可标记为完成，订单履约、施工、定价、客户和 legacy implementation 删除后回归仍是剩余阶段门。

## 42. CreateOrderUseCase 权限迁移复核（2026-08-10）

### 本轮已解决

- `CreateOrderUseCase` 的订单创建入口改由 `AccessContext` 判断 `orders/write`；指定不同销售人员改由 `store/write` 判断，避免把店长判断重新复制到创建用例。
- 客户读取改为 `customers/read` 并带 `ownerId` scope，销售仍不能为其他销售人员名下客户创建订单；正式订单车辆归属、联系人快照、容量预约、价格快照和支付事实逻辑未改变。
- 新增并部署 `20260810170000_orders_access` migration；同步补齐客服创建/读取、财务与现场岗位门店读取等历史行为所需的订单 grants。

### 自动化验证

- CreateOrderUseCase 与车辆联系人专项测试 16/16 通过。
- API 全量测试 435 个：433 通过、0 失败、2 个 opt-in 真实数据库并发测试按默认配置跳过。
- API TypeScript 检查通过；OrdersModule 已显式依赖 `PermissionsModule`。

### 评审判断

本轮没有新增 S0/S1。订单创建的 public input/output 和业务校验保持不变，授权 knowledge 从用例内部的 legacy policy 移到统一 capability seam；订单列表、支付、改单和生命周期仍待继续迁移，不能将整体订单履约 caller 标记为完成。

## 43. OrdersService 与 OrderLifecycle 权限迁移复核（2026-08-10）

### 本轮已解决

- `OrdersService` 的订单列表、导出、详情、复制草稿、支付、收款账户、改单审核和历史核验均改由 `AccessContext` 判断；销售本人范围通过 `orders/read|write` 的 owner scope 保留，财务动作仍使用 `finance/write`，店长审批改单仍要求原有财务角色边界。
- `OrderLifecycle` 的完工、取消和退回草稿等状态转换改由 `AccessContext` 判断；履约状态、库存/施工前置校验、审计事件和幂等行为未改变。
- `OrderPolicy` 已不再被订单 caller 引用，订单服务与生命周期不再直接依赖 `PermissionPolicy`；纯状态推导仍可独立运行，实际状态变更缺少访问上下文时明确失败，不会静默放行。

### 自动化验证

- `OrdersService` 定向测试 23/23 通过，`OrderLifecycle` 定向测试 9/9 通过。
- API 全量测试 435 个：433 通过、0 失败、2 个 opt-in 真实数据库并发测试按默认配置跳过。
- API TypeScript 检查和 Nest build 通过；订单服务及生命周期生产代码不再直接引用 `PermissionPolicy`。

### 评审判断

本轮没有新增 S0/S1。订单履约核心 caller 已完成访问上下文迁移，public 订单查询、支付和状态转换契约保持不变；订单域中的 `OrderPolicy` 兼容文件暂保留，待剩余核心 caller 完成后统一删除并执行删除后全量回归。施工、客户、定价以及浏览器三档验收仍是阶段门。

## 44. Construction 履约 caller 权限迁移复核（2026-08-10）

### 本轮已解决

- `ConstructionService` 的容量、派工、施工记录、物料、照片、质检、请假、排班和离线同步入口统一使用 `AccessContext`；销售本人、施工员/学徒本人任务、排班员/店长管理范围通过 capability 与 owner/store scope 保持。
- `CrossStoreConstructionService` 的跨店任务读取、执行门店操作、来源门店操作和产品映射维护统一使用 `AccessContext`，不再保留 runtime snapshot 或 store-member fallback。
- `ConstructionCostSettlementService` 的内部成本读取、店长确认、财务审批/结算和成本明细脱敏改由 `AccessContext` 判断；店长仍不能审批/结算财务成本，施工人员仍不能看到个人岗位成本、提成和补贴。
- 容量对账 controller 改由 `store/write` capability 判断；施工模块已有 `PermissionsModule` 注入，缺失访问上下文时显式失败，不静默放行。

### 自动化验证

- 施工域专项测试 33/33 通过，覆盖派工、任务范围、排班、物料、质检、离线同步、成本确认、财务结算和脱敏。
- API 全量测试 435 个：433 通过、0 失败、2 个 opt-in 真实数据库并发测试按默认配置跳过；API TypeScript 检查通过。
- `apps/api/src/construction` 不再直接引用 `PermissionPolicy`。

### 评审判断

本轮没有新增 S0/S1。施工模块的 public 业务接口和履约事实未改变，权限决策集中到访问上下文，跨店和成本结算的特殊角色边界仍显式保留。施工 caller 迁移可标记为完成；客户、定价、删除 legacy implementation 后回归以及浏览器三档验收仍待完成。

## 45. 客户、定价与报价 caller 权限迁移复核（2026-08-10）

### 本轮已解决

- `CustomersService` 的客户创建、列表、搜索、详情、编辑、人工标签、企业用户和车辆生命周期统一使用 `AccessContext`；销售继续按本人 owner scope，客服/财务/店长的门店读取边界保持，人工标签写入和删除不再依赖 `CustomerPolicy`。
- 定价 caller（核心试算、成本估算、规则集、车型价格、施工成本配置、模板和 rollout）统一使用 `AccessContext`；产品/规则读写使用 `products/read|write`，门店切换使用 `store/write`，岗位成本和迁移预检使用 `finance/write`，总部模板维护通过管理员角色解析。
- `SalesQuotesService` 的报价创建、列表、导出、详情、提交、审批、撤回、重算和转订单统一使用订单、门店和财务 capability；销售本人范围、店长审批和内部成本脱敏保持。
- `CustomerPolicy` 和 `OrderPolicy` 已无生产 caller；本轮未移除权限基础设施仍使用的运行时兼容桥，待完成删除后回归再处理。

### 自动化验证

- 客户专项测试 17/17、定价专项测试 20/20、报价专项测试 7/7 通过。
- API 全量测试 435 个：433 通过、0 失败、2 个 opt-in 真实数据库并发测试按默认配置跳过。
- API TypeScript 检查通过；客户、定价、报价生产目录不再直接引用 `PermissionPolicy`。

### 评审判断

本轮没有新增 S0/S1。五个候选的业务 caller 已完成访问上下文迁移，客户人工标签、消费概览、报价和定价成本边界均由测试锁定。剩余阶段门收敛为：移除权限服务对旧运行时桥的依赖、删除无用兼容文件/测试、删除后全量回归，以及 Web 三档浏览器验收。

## 46. 权限运行时缓存拆分与删除门复核（2026-08-10）

### 本轮已解决

- 新增 `RuntimeAccessSnapshotStore`，将 `PermissionsService` 的内部结果缓存与业务 caller 解耦；`AccessContext` 仍是唯一对业务模块公开的授权入口。
- 客户、定价、报价、施工、订单、库存、质保、售后、财务和报表生产 caller 均已不再直接调用 `PermissionPolicy`。
- 全量 API、类型检查和 Nest build 在新缓存组件加入后仍通过。

### 未关闭项

- 为保持现有兼容测试与潜在外部调用，`PermissionsService` 暂时仍向 `PermissionPolicy` 写入/清理运行时快照；这不是业务 caller 依赖，但仍是 legacy implementation 依赖。
- 因此本轮不能将“删除 legacy implementation”阶段门标记为完成；需要单独更新兼容测试为 `AccessContext/PermissionsService` 回归后，再移除旧类行为和对应测试。

### 自动化验证

- API 全量测试 435 个：433 通过、0 失败、2 个 opt-in 真实数据库并发测试按默认配置跳过。
- API TypeScript 检查和 Nest build 通过。

### 评审判断

本轮没有新增 S0/S1，但保留了一个明确的 P1 架构收口项：删除 `PermissionsService` 到 `PermissionPolicy` 的运行时桥，并以新的授权缓存/失效回归替代旧桥测试。浏览器三档验收仍未完成。

## 47. 兼容桥删除门的安全复核（2026-08-10）

### 复核结论

- 评审确认所有已迁移业务 caller 均不再直接调用 `PermissionPolicy`；`AccessContext` 是业务模块的统一授权 seam，`RuntimeAccessSnapshotStore` 负责权限解析缓存生命周期。
- 尝试一次性移除旧桥会同时改变权限基础设施、跨模块类型引用和历史兼容测试，属于高风险全局变更；本轮不绕过安全门执行该删除。
- `PermissionsService` 到 `PermissionPolicy` 的运行时双写/清理桥继续保留，作为明确的 P1 删除门，而不是将其误判为已完成。

### 新增回归

- `RuntimeAccessSnapshotStore` 增加独立生命周期测试，覆盖 set、has、clear 和 clearAll。
- 已有 API 全量 435 个测试保持 433 通过、0 失败、2 个 opt-in 真实数据库并发测试跳过；typecheck 和 Nest build 保持通过。

### 下一步准入条件

- 单独拆出类型契约迁移与旧桥行为删除，避免一次补丁跨越全部生产模块。
- 先将兼容桥测试改为 `PermissionsService/AccessContext` 的缓存填充与失效回归，再评估删除旧实现。
- 删除后必须重新执行权限专项、API 全量、Web typecheck/build 以及 1440/1024/390 浏览器验收。

## 48. 浏览器验收环境复核（2026-08-10）

### 当前证据

- Chrome 控制连接已恢复；本地 Web 服务可启动并监听 3000，打开 `/reports` 时 API 依赖不可用。
- API Nest 应用已完成路由注册并输出 `Nest application successfully started`，但报价过期后台任务访问 PostgreSQL 时收到 `ECONNREFUSED`，进程随后退出；当前未取得可信的登录态业务页面渲染结果。
- 项目 `docker-compose.yml` 提供 PostgreSQL/Redis 本地依赖，但启动持久化数据库卷属于独立环境操作，本轮不在未确认情况下执行。

### 评审判断

- 本轮没有新增 S0/S1；浏览器三档验收仍是未关闭阶段门，不能用未登录 `/auth` 或无 API 的页面结果替代业务页面证据。
- 下一次验收必须先恢复 PostgreSQL/Redis 和 API 稳定运行，再在 1440、1024、390 三个视口对代表页面执行页面加载、横向溢出、控制台错误和关键入口检查。

## 49. 旧权限实现删除与最终验收复核（2026-08-10）

### 本轮完成

- 新增 `permissions/domain/access-types.ts`，所有业务模块的 `UserWithStoreMember` 类型导入已从旧策略文件迁出。
- `PermissionsService` 只使用 `RuntimeAccessSnapshotStore` 管理内部缓存，已删除到 `PermissionPolicy` 的运行时双写/清理桥。
- 删除 `common/policies/permission.policy.ts` 及其旧测试；API 生产代码不再包含旧类或旧文件引用。

### 自动化验证

- API 全量测试 423/423 通过，包含 2 个真实 PostgreSQL 并发阶段门；API typecheck、Nest build、`git diff --check` 通过。
- Web 全量测试 616/616 通过；Web typecheck 和 production build 通过，75 个 App Router 页面生成成功。

### 浏览器验收

- 使用 `dianzhang` 成功登录并进入“北京测试 / 店长”上下文。
- `/reports`、`/customers`、`/construction/tasks`、`/finance` 在 1440、1024、390 三个视口均完成加载检查，`body/document scrollWidth` 未超过视口宽度。
- 页面没有发现 Mallbay 应用自身控制台错误；曾出现一条可识别的 Chrome 扩展异步消息通道噪声，不属于应用代码错误。

### 评审判断

本轮未新增 S0/S1。旧权限实现删除、删除后全量回归和代表页面三档验收均有直接证据；五个候选的实现阶段门已达到 PRD 验收条件。
