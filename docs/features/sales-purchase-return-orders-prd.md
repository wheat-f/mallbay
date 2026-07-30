# 销售退货单与采购退货单 PRD

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 需求名称 | 销售退货单与采购退货单 |
| 文档版本 | v2.6 |
| 当前状态 | 技术方案已确认，待研发评审 |
| 创建日期 | 2026-07-30 |
| 关联材料 | `docs/features/paint-protection-film-system-plan.md`、库存与采购现有实现 |
| 适用范围 | 门店销售、库存、采购、财务和审计流程 |

### 已确认决策

- 本期不启用总部审批金额阈值；销售退货由店长业务审批，采购退货由店长或采购负责人业务审核，涉及结算金额的采购退货由财务审核。
- 销售退货同步冲减订单收入、材料成本和销售提成。
- 建立独立待检库存；待检库存不可销售、锁库或用于施工。
- 本期不接第三方支付，实际退款由线下完成，系统记录申请和财务确认结果。
- 本期不做自动换货，供应商换货结果仅记录，后续重新走采购入库。
- 销售退货期限默认为订单完成后 30 天，暂不配置化。

### 已确认的财务与库存规则

以下规则已由业务、财务和库存角色确认，研发按此实现：

- 部分退款允许多次确认；待退款金额为“核定退款金额 - 历史已退款金额”，待退款金额为 0 后才能关闭。客户放弃剩余退款时由财务填写原因并关闭。
- 收入按实际确认退款金额冲减；可售/待检退货按实际确认退回数量和原出库批次单位成本冲减材料成本；报损退货不冲减材料成本；提成按实际退货商品金额比例冲减，已结算提成进入下一期扣减。
- 销售可售退货优先关联原订单出库批次；无法确认原批次时创建退货待检批次，验收转可售后继承成本快照。
- 采购退货使用 supplierId 和供应商名称快照；历史采购订单仅保存供应商名称时，系统按门店和名称匹配，无法唯一匹配时必须由采购人工选择并记录匹配结果。新增供应商退货结算调整记录，默认应付抵扣，支持多次部分退款或抵扣。
- 销售退货归属实际执行门店；跨店订单由实际执行门店负责收货和库存变化，来源门店只保留订单关联。
- 普通 RETURN_IN/RETURN_OUT 不得代替退货单；保留历史查询，新退货接口禁止以 STOCK_OPERATION 产生退货流水。
- 待检商品使用独立子批次，子批次通过 parentBatchId 关联原批次，并增加 inventoryStatus：AVAILABLE、INSPECTION、DAMAGED。
- 无法追溯原销售出库批次时，使用订单材料成本快照作为单位成本，并标记成本待核验。
- 供应商结算使用独立 SupplierReturnSettlementAdjustment 作为业务主记录；实际供应商退款同步生成 PaymentRecord，应付抵扣只生成结算调整记录。
- 退货状态、库存、财务调整和审计必须在同一数据库事务内完成；线下退款不由系统调用第三方支付。
- 每个退货动作使用幂等键，按退货单 ID、动作类型和幂等键唯一；重复请求返回首次结果。
- 历史手工退货流水只读保留，不回填为退货单。

## 2. 需求背景

### 2.1 业务背景

系统已具备销售订单、采购订单、库存批次、采购入库、订单出库和售后工单能力。库存流水枚举已包含 `RETURN_IN` 和 `RETURN_OUT`，但目前退货主要通过通用手工库存操作完成。

### 2.2 当前问题

当前没有独立的销售退货单和采购退货单，导致：

- 退货无法可靠关联销售订单明细、采购订单明细和库存批次；
- 缺少退货数量、重复退货和跨门店校验；
- 库存已调整但退款、供应商退款或应付抵扣没有正式业务链路；
- 售后工单中的退款补偿、供应商追偿不能替代库存和结算单据；
- 手工 `RETURN_IN/RETURN_OUT` 缺少审批、执行和完整审计。

### 2.3 需求依据

- 当前库存模型已有批次、数量、单位换算和库存流水能力。
- 采购入库流水已通过 `PURCHASE_ORDER_ITEM` 关联采购明细和库存批次。
- 现有收款冲销能力可作为销售退款的财务基础。
- 已确认采用本 PRD 第 17 节的默认决策。

## 3. 产品目标

- 建立销售退货和采购退货独立单据，形成可追溯的业务主链路。
- 将退货申请、审批、库存执行和财务结算分离。
- 防止超数量退货、错门店退货、重复退货和库存金额不一致。
- 支持部分退货、部分退款、供应商退款和应付抵扣。
- 让库存流水、订单/采购单、售后和财务记录通过单据 ID 关联。

## 4. 本期范围与非目标

### 4.1 本期范围

- 销售退货单的创建、提交、审核、收货验收和退款确认。
- 采购退货单的创建、提交、审核、批次出库和供应商结算确认。
- 部分退货、部分收货、部分退款和部分结算。
- 可售、待检、报损三类销售退回结果。
- 退货来源、库存流水、财务记录和审计时间线。
- 门店角色权限和门店数据范围控制。

### 4.2 本期不包含

- 复杂换货自动配货流程；本期仅登记供应商换货结果，不自动配货或自动入库；
- 供应商接口、第三方支付自动退款接口；
- 总部审批金额阈值配置；
- 跨财务主体的跨店退货；
- 自动生成独立可配置的 `FinanceSettlement` 结算规则；
- 退货数据迁移的历史补录工具。

上述内容如需纳入本期，应单独评估数据模型、接口和工作量。

## 5. 用户角色与权限

默认角色如下：店长、销售/客服、采购、财务。库存执行职责由采购角色承担，不新增独立的“库存执行人员”系统角色。当前系统的库存和采购权限以门店为数据边界。

| 角色 | 可查看 | 可新增/编辑 | 可审批 | 可执行库存 | 可确认财务 |
|---|---|---|---|---|---|
| 店长 | 本店全部退货及完整金额 | 两类退货 | 两类退货 | 两类退货 | 否 |
| 销售/客服 | 本店销售退货及关联销售订单 | 发起销售退货草稿 | 否 | 否 | 否 |
| 采购 | 本店采购退货、采购单、批次及销售退货库存结果 | 发起两类退货草稿，补充验收/出库结果 | 采购退货业务审核沿用采购规则 | 销售退货收货、采购退货出库、待检状态转换 | 维护供应商处理结果，不确认资金 |
| 财务 | 本店退货及财务金额 | 补充/确认结算信息 | 退款、供应商结算金额 | 否 | 是 |

| 施工 | 不进入退货管理 | 无 | 无 | 无 | 无 |
| 审计/总部管理员 | 按总部角色矩阵查看 | 以正式权限矩阵为准 | 以正式权限矩阵为准 | 以正式权限矩阵为准 | 以正式权限矩阵为准 |

权限实现必须同时校验角色权限和 `storeId`，不能只依赖前端隐藏按钮。

## 6. 核心业务对象

| 对象 | 定义 | 关键关系 | 主要状态 |
|---|---|---|---|
| 销售退货单 | 客户针对已售订单发起的退货、退款或补偿业务单据 | 关联 `Order`、`OrderItem`，可关联 `AfterSale` | 草稿、已提交、已审核、待收货、部分收货、已收货待退款、部分退款、已退款、部分取消、已关闭、已驳回、已取消 |
| 销售退货明细 | 销售订单中具体产品和退货数量 | 关联订单明细、产品、库存批次 | 待验收、部分收货、已收货 |
| 采购退货单 | 门店将已入库商品退回供应商的业务单据 | 关联 `PurchaseOrder`、`PurchaseOrderItem`、库存批次 | 草稿、已提交、已审核、待出库、部分出库、已出库待结算、部分结算、已结算、部分取消、已关闭、已驳回、已取消 |
| 采购退货明细 | 采购订单及入库批次中具体产品和退货数量 | 关联采购明细、入库批次 | 待出库、部分出库、已出库 |
| 退货库存流水 | 退货单执行后产生的真实库存变化 | `sourceType` 与 `sourceId` 指向退货单/明细 | `RETURN_IN`、`RETURN_OUT`、`STOCK_ADJUST` 或 `DAMAGE_OUT` |
| 退货结算记录 | 退款、供应商退款或应付抵扣的财务结果 | 关联退货单及原收款/采购成本 | `PENDING`（待确认）、`CONFIRMED`（已确认）、`REVERSED`（已冲销） |

## 7. 业务流程

### 7.1 销售退货主流程

1. 销售/客服从销售订单详情进入“发起销售退货”，系统带出客户、门店、订单明细、原销售价和已收款信息。
2. 用户选择退货明细和数量，填写退货原因、退货方式、附件，并提交草稿。
3. 系统校验可退数量、订单状态、门店和产品一致性；校验通过后进入“已提交”。
4. 店长审核退货业务，确认退货数量、退款金额和库存处理方式。
5. 实物退货进入“待收货”，采购角色验收并判定为可售、待检或报损。
6. 系统在验收事务中更新库存并生成 `RETURN_IN`；报损结果不得增加可用库存。
7. 单据进入“已收货待退款”，财务确认退款金额和退款方式。
8. 财务在线下完成退款后，在系统中登记退款方式、金额和凭证；系统确认后单据进入“已退款”。
9. 所有明细完成收货和结算后，系统进入“已关闭”，订单、收款、提成和报表读取退货结果。

### 7.2 销售“不退货直接退款”分支

1. 销售退货申请中选择“不退货直接退款”。
2. 店长审核退货原因、数量和退款金额。
3. 审核通过后跳过库存收货，直接进入“已收货待退款”。
4. 财务确认全部退款后进入“已退款”；确认部分退款后进入“部分退款”，库存不产生 `RETURN_IN`。

### 7.3 采购退货主流程

1. 采购从已收货采购订单或入库批次进入“发起采购退货”。
2. 系统带出供应商、采购明细、批次、入库数量、成本和可退数量。
3. 采购选择批次和数量，填写原因及供应商处理方式，提交草稿。
4. 系统校验批次归属、库存可用数量、历史退货数量和采购单状态。
5. 店长/采购负责人先审核业务；涉及结算金额的采购退货，再由财务审核核定可结算金额。两类审核均完成后单据才进入“待出库”。
6. 采购角色按指定批次执行出库，系统在同一事务中扣减可用库存并生成 `RETURN_OUT`。
7. 单据进入“已出库待结算”，采购录入供应商确认结果。
8. 财务确认供应商退款、应付抵扣、换货或部分处理结果；换货只记录供应商处理结果，不自动生成换货入库任务。
9. 全部明细完成出库和结算后，单据进入“已关闭”。

### 7.4 售后关联规则

- 质量问题、施工问题和客户投诉可以关联售后工单。
- 普通错发、未使用退货和采购质量退货可以不创建售后工单。
- 售后工单记录问题、责任和服务处理；退货单记录库存和资金变化。
- 售后费用中的退款补偿、供应商追偿不得直接改变库存，必须通过退货单或财务结算记录处理。

## 8. 状态流转

### 8.1 销售退货状态

| 原状态 | 触发条件 | 新状态 | 系统动作 |
|---|---|---|---|
| 草稿 | 字段完整且用户提交 | 已提交 | 冻结业务明细，重新校验可退数量 |
| 已提交 | 店长审核通过 | 已审核 | 固化业务和金额快照 |
| 已提交 | 店长驳回 | 已驳回 | 记录驳回原因，可修改后重新提交 |
| 已审核 | 需要实物退货 | 待收货 | 等待库存验收 |
| 已审核 | 选择不退货直接退款 | 已收货待退款 | 跳过库存验收 |
| 待收货 | 完成部分验收 | 部分收货 | 生成实际已收货数量 |
| 待收货/部分收货 | 全部验收完成 | 已收货待退款 | 生成对应库存结果 |
| 已收货待退款 | 财务确认部分退款 | 部分退款 | 生成本次退款/冲销记录，计算剩余待退款金额 |
| 已收货待退款/部分退款 | 财务确认全部退款 | 已退款 | 生成本次退款/冲销记录并清零待退款金额 |
| 部分退款 | 财务确认客户放弃剩余退款 | 已关闭 | 记录放弃金额和原因，不再允许退款 |
| 已退款 | 所有明细完成收货和退款 | 已关闭 | 写入关闭审计 |
| 草稿/已提交 | 申请人或店长确认取消 | 已取消 | 记录取消原因，不产生库存流水 |
| 已审核 | 尚未收货且尚未退款 | 已取消 | 店长取消，释放未执行数量，不产生冲销流水 |
| 部分收货/部分退款 | 取消剩余未执行数量 | 部分取消 | 保留已收货和已退款数据；释放剩余数量，待已执行部分退款完成后关闭 |

### 8.2 采购退货状态

| 原状态 | 触发条件 | 新状态 | 系统动作 |
|---|---|---|---|
| 草稿 | 字段完整且用户提交 | 已提交 | 冻结退货批次和数量 |
| 已提交 | 店长/采购负责人业务审核且财务完成结算金额审核 | 已审核 | 固化采购、批次和结算快照；不满足任一审核条件不得进入待出库 |
| 已提交 | 审核驳回 | 已驳回 | 记录驳回原因，可修改后重新提交 |
| 已审核 | 等待库存执行 | 待出库 | 允许采购角色按批次出库 |
| 待出库 | 完成部分出库 | 部分出库 | 记录实际出库数量 |
| 待出库/部分出库 | 全部出库完成 | 已出库待结算 | 锁定实际退货金额 |
| 已出库待结算 | 财务确认部分退款或抵扣 | 部分结算 | 生成本次供应商结算记录并保留剩余金额 |
| 已出库待结算/部分结算 | 财务确认全部退款或抵扣，或换货结果已完成且无待确认金额 | 已结算 | 生成供应商结算记录或换货完成记录并清零剩余金额 |
| 已结算 | 所有明细完成处理 | 已关闭 | 写入关闭审计 |
| 草稿/已提交 | 申请人或店长确认取消 | 已取消 | 记录取消原因，释放待执行数量，不产生退货流水 |
| 已审核 | 尚未出库且尚未结算 | 已取消 | 店长取消，释放未执行数量，不产生冲销流水 |
| 部分出库/部分结算 | 取消剩余未执行数量 | 部分取消 | 保留已出库和已结算数据；释放剩余数量，待已执行部分结算完成后关闭 |

已关闭、已退款、已结算、已取消均为终态，不允许直接编辑；部分退款、部分结算和部分取消不是终态；更正必须通过红冲或反向单据实现。部分处理单取消时只能释放剩余未执行数量，不能取消已产生的库存、退款或结算结果；已执行部分完成退款/结算后进入“已关闭”。

### 部分处理闭环规则

- 销售退货进入“部分退款”后，允许财务再次确认剩余退款；每次确认均记录实际退款金额和凭证。
- 待退款金额等于核定退款金额减历史已退款金额；待退款金额大于 0 时不能进入“已关闭”。
- 客户明确放弃剩余退款时，财务填写放弃原因，系统将剩余金额置为 0 并关闭单据；该操作不可撤销，只能通过红冲或反向单据更正。
- 销售部分收货或采购部分出库后，允许取消剩余未执行数量；已执行数量必须先完成对应退款或供应商结算。
- 退货单取消后释放未执行数量，不冲销已经产生的库存流水。

## 9. 功能需求

### 9.1 销售退货单

#### 创建规则

- 入口为销售订单详情和销售退货列表。
- 只有订单属于当前门店，且订单状态为已完成、质保中或业务允许的已交付状态时才可发起。
- 订单明细必须已销售；未出库、已取消或未交付明细不可退货。
- 支持实物退货和不退货直接退款。
- 支持一次选择多条订单明细和部分数量。

#### 数量规则

```text
可退数量 = 已销售数量 - 历史已退数量 - 已提交未关闭数量
```

当申请数量大于可退数量时，系统拒绝提交并提示可退数量。

#### 收货验收规则

- 采购角色必须选择实际收货数量和处理结果。
- “可售”结果增加指定门店指定仓库的可用库存，并生成 `RETURN_IN`。
- “待检”结果进入独立待检库存，不得销售、锁库或用于施工，也不得计入可用库存。
- “报损”结果不得增加库存；如需报损，生成报损记录并关联退货明细。
- 同一退货明细可分多次收货，但实际收货总量不得超过申请数量。

#### 退款规则

- 默认退款金额由原订单明细金额和实际确认退货数量计算。
- 店长可在审核时调整退款金额，但必须填写调整原因。
- 财务只能在审核通过、实际收货完成或选择不退货直接退款后确认退款。
- 本期不对接第三方支付；财务在线下完成实际打款后，必须在系统登记退款凭证和确认结果。
- 退款金额不得超过原订单已收款金额和本退货单核定金额。
- 允许部分退款；未退款金额继续保留为待结算金额。
- 当当前时间超过订单完成时间 30 个自然日时，系统禁止新建销售退货单；已创建的退货单不受创建窗口影响。
- 质保中订单仍受 30 天创建窗口限制，除非后续业务确认单独豁免。
- 收入按实际确认退款金额执行；可售/待检退货材料成本按实际确认退回数量乘原出库批次单位成本冲减；报损退货不冲减材料成本；销售提成按实际退货商品金额比例冲减，已结算提成进入下一期扣减。每次退款或供应商结算确认时立即生成调整记录。

### 9.2 采购退货单

#### 创建规则

- 入口为采购订单详情、采购入库批次和采购退货列表。
- 采购订单必须已审批且至少存在实际入库数量。
- 必须选择具体库存批次，不支持只选择产品而不指定批次。
- 支持多批次、多明细和部分退货。

#### 数量规则

```text
可退数量 = 采购入库数量 - 历史已退数量 - 已提交未关闭数量
```

当申请数量大于可退数量或大于当前可出库数量时，系统拒绝提交或执行。

#### 出库规则

- 出库时再次锁定批次并校验可用库存，避免审核后库存被其他业务占用。
- 出库数量超过可用库存时，整次操作失败，不产生部分流水。
- 出库完成后生成 `RETURN_OUT`，来源指向采购退货单和退货明细。
- 已锁定、已出库、已报损数量不得重复退货。

#### 供应商结算规则

- 支持供应商退款、应付抵扣、换货结果登记和部分处理。
- 默认结算方式为应付抵扣。
- 每次供应商确认金额可以小于申请金额；系统写入本次结算金额、累计结算金额和剩余待结算金额。差额必须填写原因并进入财务异常处理。
- 本期不自动生成换货入库任务；供应商换货到货后，按正常采购入库流程重新入库，并在入库备注中关联原采购退货单。换货不计入供应商退款或应付抵扣金额，除非财务另行确认金额。
- 纯换货场景下，供应商换货结果已登记、所有退货明细已完成出库且无待确认退款/抵扣金额时，单据进入“已结算”，随后进入“已关闭”。

### 9.3 列表与详情

列表至少支持：退货单号、来源单号、客户/供应商、门店、状态、申请人、申请日期、金额、更新时间和待处理节点筛选。

详情页必须展示：

- 来源销售订单或采购订单；
- 退货明细、数量、单位和批次；
- 审核结果和原因；
- 实际收货/出库结果；
- 退款或供应商结算信息；
- 关联售后工单；
- 库存流水和财务流水；
- 完整操作时间线。

## 10. 数据与字段

### 10.1 销售退货单

| 字段 | 类型 | 必填 | 规则 |
|---|---|---:|---|
| returnNo | String | 是 | 系统生成，唯一 |
| storeId | String | 是 | 销售退货固定为实际执行门店；采购退货固定为采购订单门店 |
| sourceStoreId | String | 销售退货必填 | 保存销售订单来源门店；跨店退货时与 storeId 可不同 |
| executionStoreId | String | 销售退货必填 | 等于 storeId，表示实际收货和库存变化门店 |
| orderId | String | 是 | 必须关联有效销售订单 |
| customerId | String | 是 | 从订单快照带出，不允许跨客户修改 |
| afterSaleId | String | 否 | 可关联售后工单 |
| returnMode | Enum | 是 | `PHYSICAL_RETURN`、`REFUND_ONLY` |
| status | Enum | 是 | 按销售退货状态机管理 |
| reason | String | 是 | 提交前必填 |
| requestedRefundCents | Int | 否 | 审核前可计算，金额单位为分 |
| approvedRefundCents | Int | 否 | 审核通过后固化 |
| actualRefundCents | Int | 否 | 本次实际确认退款金额；每次退款动作覆盖写入本次值 |
| refundedAmountCents | Int | 否 | 历史累计实际退款金额；由所有已确认退款明细汇总 |
| waivedRefundCents | Int | 否 | 客户放弃的剩余退款金额，填写放弃原因后写入 |
| remainingRefundCents | Int | 否 | 核定退款金额 - 已退款金额 - 放弃金额 |
| waiverReason | String | 否 | 放弃剩余退款时必填 |
| revenueAdjustmentId | String | 否 | 关联收入冲减记录 |
| costAdjustmentId | String | 否 | 关联材料成本冲减记录 |
| commissionAdjustmentId | String | 否 | 关联提成扣减记录 |
| createdById | String | 是 | 申请人 |
| approvedById | String | 否 | 业务审批人 |
| receivedById | String | 否 | 收货人 |
| refundMethod | Enum | 否 | 财务确认退款时必填；沿用现有财务退款方式枚举，本期仅允许线下方式，不调用第三方支付 |
| voucherId | String | 否 | 财务确认退款时必填；关联线下退款凭证或附件记录 |
| refundedById | String | 否 | 财务确认人 |
| version | Int | 是 | 并发更新控制 |

### 销售退货明细补充字段

| 字段 | 类型 | 必填 | 规则 |
|---|---|---:|---|
| sourceOutboundBatchId | String | 否 | 优先关联原订单出库批次；无法确认时允许为空并创建退货待检批次 |
| inspectionStatus | Enum | 是 | AVAILABLE、INSPECTION、DAMAGED |
| actualReceivedQuantity | Decimal | 是 | 不得超过申请数量 |
| refundEligibleQuantity | Decimal | 是 | 按实际确认可退款数量计算 |
| refundedQuantity | Decimal | 否 | 历史累计已退款数量；不得超过 refundEligibleQuantity |
| inspectionApprovalStatus | Enum | 否 | 待检明细默认 PENDING；取值 PENDING、APPROVED、EXECUTED、REJECTED；非待检明细为 NULL |
| inspectionApprovedQuantity | Decimal | 否 | 店长/采购负责人批准的状态转换数量 |
| inspectionApprovedById | String | 否 | 待检状态转换审核人 |
| inspectionApprovedAt | DateTime | 否 | 待检状态转换审核时间 |
| costAdjustmentCents | Int | 否 | 按确认的材料成本口径生成 |
| commissionAdjustmentCents | Int | 否 | 按确认的提成口径生成 |
### 10.2 采购退货单

| 字段 | 类型 | 必填 | 规则 |
|---|---|---:|---|
| returnNo | String | 是 | 系统生成，唯一 |
| storeId | String | 是 | 必须为采购订单门店 |
| purchaseOrderId | String | 是 | 必须关联有效采购订单 |
| supplierName | String | 是 | 从采购订单带出，可补充快照 |
| supplierId | String | 是 | 关联门店供应商主数据 |
| supplierResolutionStatus | Enum | 是 | MATCHED、MANUAL_MATCH_REQUIRED；历史采购订单无法唯一匹配时禁止自动提交 |
| supplierResolutionNote | String | 否 | 人工匹配时记录候选供应商、选择理由、操作人和操作时间 |
| supplierNameSnapshot | String | 是 | 保存提交时的供应商名称快照 |
| supplierDocumentNo | String | 否 | 供应商退货/确认凭证号 |
| differenceReason | String | 否 | 申请金额与确认金额不一致时必填 |
| status | Enum | 是 | 按采购退货状态机管理 |
| reason | String | 是 | 提交前必填 |
| settlementMode | Enum | 是 | `SUPPLIER_REFUND`、`PAYABLE_OFFSET`、`EXCHANGE`、`MIXED` |
| requestedAmountCents | Int | 否 | 根据批次成本计算 |
| confirmedAmountCents | Int | 否 | 业务与财务审批完成后固化的核定可结算金额 |

| settledAmountCents | Int | 否 | 结算调整记录的累计财务结算金额汇总，只读 |
| remainingAmountCents | Int | 否 | 核定可结算金额 - 结算调整记录累计金额，只读派生值 |

| createdById | String | 是 | 申请人 |
| approvedById | String | 否 | 业务审批人 |
| financialApprovedById | String | 否 | 财务审核结算金额的人员 |
| outboundById | String | 否 | 出库人 |
| settledById | String | 否 | 财务确认人 |
| version | Int | 是 | 并发更新控制 |

### 10.3 退货库存流水

现有 `InventoryMovement` 继续承载退货及待检状态转换流水，允许 `RETURN_IN`、`RETURN_OUT`、`STOCK_ADJUST` 和 `DAMAGE_OUT`，但必须满足：

- 销售实物退货生成 `RETURN_IN`，采购退货生成 `RETURN_OUT`。
- 新退货接口不得调用 `createStockOperation` 生成 `sourceType=STOCK_OPERATION` 的退货流水；历史手工流水只读保留。
- 待检转可售复用 `STOCK_ADJUST`，设置 `sourceType=SALES_RETURN_INSPECTION`，记录原状态、目标状态、退货明细、批次和原因。
- 待检转报损使用 `DAMAGE_OUT`，必须关联退货明细和报损原因。

| 字段 | 规则 |
|---|---|
| movementType | 销售实物退货为 `RETURN_IN`；采购退货为 `RETURN_OUT`；待检转可售为 `STOCK_ADJUST`；待检转报损为 `DAMAGE_OUT` |
| sourceType | `SALES_RETURN`、`PURCHASE_RETURN` 或 `SALES_RETURN_INSPECTION`；`STOCK_OPERATION` 仅保留历史读取，不允许新建 |
| sourceId | 指向退货单或退货明细的唯一 ID |
| batchId | 销售可售退货和采购退货必须关联具体批次；新建待检批次需记录父来源 |
| quantity | 使用 Decimal，按库存基准单位保存 |
| createdById | 记录实际库存执行人 |
| note | 仅用于展示，不作为业务关联依据 |

### 10.4 财务调整对象

| 调整类型 | 触发条件 | 关联对象 | 规则 |
|---|---|---|---|
| 收入冲减 | 每次实际退款确认 | 销售退货单、退货明细、原订单 | 按实际退款金额生成唯一调整记录 |
| 材料成本冲减 | 可售/待检退货实际收货确认 | 退货明细、原出库批次 | 实际退回数量 × 原出库批次单位成本；报损不生成成本冲减 |
| 提成扣减 | 退货财务确认 | 原订单提成结算、退货明细 | 按实际退货商品金额比例生成扣减；已结算提成进入下一期 |
| 客户收款冲销 | 线下退款完成并登记凭证 | 原订单收款记录、现有 CustomerReceiptReversal | 每次退款使用幂等键，禁止重复冲销 |
| 供应商结算调整 | 每次供应商退款或应付抵扣确认 | 采购退货单、供应商、采购成本 | 记录本次退款/抵扣/换货拆分金额，累计值由采购退货单汇总；实际退款另关联 PaymentRecord |

SupplierReturnSettlementAdjustment 为供应商结算业务主记录，至少包含：id、purchaseReturnId、supplierId、sequenceNo、status、settlementMode、refundAmountCents、payableOffsetAmountCents、exchangeQuantity、exchangeAmountCents、supplierDocumentNo、differenceReason、paymentRecordId（实际退款时必填）、idempotencyKey、createdById、createdAt、reversedAt。`status` 取 `PENDING`、`CONFIRMED`、`REVERSED`；只有 `CONFIRMED` 记录计入累计结算。每次结算生成递增 `sequenceNo`，同一采购退货单允许多条调整记录；每条记录的财务结算金额等于 `refundAmountCents + payableOffsetAmountCents`，累计财务结算金额不得超过核定可结算金额；换货金额单独记录，不计入退款或应付抵扣，除非财务明确确认金额。`PurchaseReturn.settledAmountCents` 和 `remainingAmountCents` 由已确认明细聚合生成，只读且不作为明细字段重复保存。应付抵扣不生成 PaymentRecord。

实际供应商退款确认时，系统在同一事务中创建结算调整记录和 PaymentRecord：PaymentRecord.sourceType 固定为 `SUPPLIER_RETURN_SETTLEMENT`，PaymentRecord.sourceId 指向结算调整记录，type 固定为 `SUPPLIER_REFUND_OUT`，amountCents 使用正数表示本次退款金额，direction 固定为 `OUTFLOW`，accountId 使用实际执行门店的财务账户。若现有枚举不支持 `SUPPLIER_REFUND_OUT` 或 `OUTFLOW`，迁移中新增对应枚举；不得伪装为客户收款冲销。应付抵扣仅创建结算调整记录，并进入后续应付账务映射；结算调整撤销时必须同时生成反向 PaymentRecord。正向退款记录使用 `SUPPLIER_REFUND_OUT + OUTFLOW`；反向记录使用 `SUPPLIER_REFUND_REVERSAL + INFLOW`，金额等于原记录金额，`sourceId` 指向同一结算调整记录，`reversalOfId` 指向原 PaymentRecord。原结算调整记录变为 `REVERSED` 后不得再次冲销，反向记录必须保持幂等。

冲销后的 PurchaseReturn 状态按剩余有效结算金额重新计算：若全部已出库且仍有待结算金额，状态为“部分结算”；若不存在有效结算记录，状态为“已出库待结算”。若单据已关闭，冲销后按上述规则重新打开并写入状态变更审计；库存出库流水不回滚，已发生的供应商退款通过反向 PaymentRecord 表达。

PaymentRecord 的正向退款记录保持原金额和原始业务事实不变；系统不修改其金额，不复用客户收款冲销状态。冲销通过同一结算调整记录下新增一条反向 PaymentRecord 表达，反向记录的 `reversalOfId` 必须唯一指向原正向记录，原正向记录的 `reversedById` 指向反向记录（若现有模型不支持则迁移新增），且同一原记录只能成功冲销一次。冲销成功后，SupplierReturnSettlementAdjustment 更新为 `REVERSED`；PaymentRecord 原记录和反向记录均保留可追溯状态，禁止物理删除。财务冲销接口必须使用独立幂等键，并在同一事务中完成状态校验、反向记录、结算状态和审计写入。
PaymentRecord 关系字段必须纳入数据模型：`reversalOfId` 为可空外键，指向被冲销的正向 PaymentRecord；`reversedById` 为可空外键，指向反向 PaymentRecord；`reversalOfId` 建立唯一约束，禁止同一正向记录生成多条反向记录。两字段必须互相一致，反向记录的 `reversalOfId` 与原记录的 `reversedById` 必须在同一事务内写入。
成本核验重新提交时，`supplementNote` 为必填文本，长度 1-1000 字；`attachmentIds` 为当前门店可访问的附件 ID 数组，最多 10 个，附件必须属于该退货明细或本次核验申请。

### 10.5 待检库存流水

- 待检转可售复用 `STOCK_ADJUST`，设置 `sourceType = SALES_RETURN_INSPECTION`，记录原状态、目标状态、退货明细、批次和操作原因。待检数量部分转可售时不得直接修改同一子批次的状态并保留剩余待检数量；系统必须拆分子批次：原 `INSPECTION` 子批次数量扣减转可售数量，新建数量相等的 `AVAILABLE` 子批次，并通过 `parentBatchId`、来源退货明细和成本快照建立关联。
- 待检转报损使用 `DAMAGE_OUT`，必须关联销售退货明细并填写报损原因；系统扣减原 `INSPECTION` 子批次数量，并按报损数量创建 `DAMAGED` 子批次，不增加可用库存。
- 待检转可售、待检转报损都必须由店长或采购负责人审核后，由采购角色执行；审核接口只记录批准数量和目标状态，转换接口才实际改库存。审核状态写入退货明细，执行动作写入 `ReturnAction`，重复审核或执行不得重复扣减库存。
- 待检状态转换动作使用 `INSPECTION_APPROVE`、`INSPECTION_CONVERT` 两类 actionType；批准数量不得超过当前 INSPECTION 子批次数量。
- 状态转换必须在同一数据库事务中完成库存数量校验、原子扣减、目标子批次创建、库存流水和审计记录；数量不足时全部回滚。
### 10.6 库存子批次技术字段

| 字段 | 类型 | 规则 |
|---|---|---|
| parentBatchId | String | 指向当前子批次的直接来源批次；部分状态转换新建的目标子批次指向原待检子批次 |
| inventoryStatus | Enum | AVAILABLE、INSPECTION、DAMAGED；单个子批次仅允许一种状态；默认待检子批次为 INSPECTION |
| unitCostCents | Int | 优先继承原出库批次成本；无法追溯时使用订单材料成本快照并标记待核验 |
| sourceType | Enum | 销售退货待检子批次为 `SALES_RETURN_INSPECTION`，禁止使用自由字符串 |
| sourceId | String | 指向销售退货明细 |
| originOutboundBatchId | String | 指向最初销售出库批次；无法追溯时为空 |
| costVerificationStatus | Enum | PENDING_VERIFICATION、VERIFIED、REJECTED；无法追溯原出库批次时默认 PENDING_VERIFICATION |
| costVerificationNote | String | 成本待核验原因、核验人和核验时间；成本待核验时必填 |

### 10.7 成本待核验闭环

- 无法追溯原销售出库批次时，采购提交成本核验申请，财务确认单位成本后将 `costVerificationStatus` 从 `PENDING_VERIFICATION` 更新为 `VERIFIED`；财务驳回时更新为 `REJECTED`，必须填写驳回原因，采购补充材料后可重新提交为 `PENDING_VERIFICATION`。
- 成本确认前允许库存继续按快照入账，但不得修改已发生的原始库存流水；成本差异通过独立成本调整记录和反向/补充流水处理。
- 成本核验申请、确认、驳回和调整必须记录操作者、原值、新值、原因和时间。

### 10.8 历史数据兼容

- 历史 STOCK_OPERATION 退货流水不转换为退货单，保留原数据和查询能力。
- 新版本服务端拒绝创建 sourceType=STOCK_OPERATION 且 movementType 为 RETURN_IN/RETURN_OUT 的新流水。
- 历史采购订单仅有 supplierName 时，按门店和名称匹配 Supplier；无法唯一匹配时要求采购人工选择并记录 supplierResolutionStatus、候选供应商和选择理由。
## 11. 接口需求

```text
GET    /sales-returns
POST   /sales-returns
GET    /sales-returns/:id
POST   /sales-returns/:id/submit
POST   /sales-returns/:id/approve
POST   /sales-returns/:id/receive
POST   /sales-returns/:id/inspection/approve
POST   /sales-returns/:id/inspection/convert
POST   /sales-returns/:id/cost-verification/submit
POST   /sales-returns/:id/cost-verification/confirm
POST   /sales-returns/:id/cost-verification/resubmit
POST   /sales-returns/:id/refund
POST   /sales-returns/:id/cancel

GET    /purchase-returns
POST   /purchase-returns
GET    /purchase-returns/:id
POST   /purchase-returns/:id/submit
POST   /purchase-returns/:id/approve
POST   /purchase-returns/:id/outbound
POST   /purchase-returns/:id/settle
POST   /purchase-returns/:id/settlement/reverse
POST   /purchase-returns/:id/cancel
```

接口权限与请求参数规则：

| 接口 | 允许角色 | 必填请求字段 | 关键校验 |
|---|---|---|---|
| `sales-returns` | 销售/客服、店长、采购 | `orderId`、`returnDetails`、`returnMode`、`reason`、`idempotencyKey` | 来源订单属于当前门店，订单状态和退货窗口有效，明细和数量校验通过 |
| `sales-returns/:id/submit` | 创建人（销售/客服、店长、采购） | `idempotencyKey` | 草稿字段完整，门店一致，重新校验可退数量 |
| `sales-returns/:id/approve` | 店长 | `approvedQuantity`、`approvedRefundAmountCents`、`returnMode`、`reason`、`idempotencyKey` | 当前状态为已提交，数量和退款金额不超过可核定范围 |
| `sales-returns/:id/receive` | 采购 | `returnDetailResults`、`idempotencyKey` | 当前状态允许收货，实际数量不超过批准数量，事务内生成库存结果 |
| `sales-returns/:id/refund` | 财务 | `actualRefundCents`、`refundMethod`、`voucherId`、`idempotencyKey` | 当前状态允许退款，金额不超过待退款金额，凭证和金额校验通过 |
| `sales-returns/:id/cancel` | 店长 | `reason`、`idempotencyKey` | 仅允许草稿/已提交或部分处理单取消剩余未执行数量，不回滚已执行结果 |
| `purchase-returns` | 采购、店长 | `purchaseOrderId`、`returnDetails`、`settlementMode`、`reason`、`idempotencyKey` | 采购订单和批次属于当前门店，可退数量和供应商匹配校验通过 |
| `purchase-returns/:id/submit` | 创建人（采购、店长） | `idempotencyKey` | 草稿字段完整，批次、门店和可退数量校验通过 |
| `purchase-returns/:id/approve` | 店长/采购负责人或财务 | `approvalType`、`reason`、`idempotencyKey`；`BUSINESS` 时必填 `approvedQuantity`，`FINANCIAL` 时必填 `confirmedAmountCents` | `approvalType=BUSINESS` 时仅业务审核；`approvalType=FINANCIAL` 时仅财务审核；两类审核均完成后才进入待出库 |
| `purchase-returns/:id/outbound` | 采购 | `outboundDetails`、`idempotencyKey` | 已完成业务和财务审核，批次库存足够，事务内生成 RETURN_OUT |
| `purchase-returns/:id/settle` | 财务 | `settlementMode`、`refundAmountCents`、`payableOffsetAmountCents`、`exchangeQuantity`、`supplierDocumentNo`、`differenceReason`、`idempotencyKey` | 当前状态为已出库待结算/部分结算，金额不得超过核定可结算金额，差额原因按规则必填 |
| `purchase-returns/:id/cancel` | 店长/采购负责人 | `reason`、`idempotencyKey` | 仅允许草稿/已提交或部分处理单取消剩余未执行数量，不回滚已出库和已结算结果 |
| `inspection/approve` | 店长、采购负责人 | `returnDetailId`、`approvedQuantity`、`targetStatus`、`reason`、`idempotencyKey` | 明细为 INSPECTION，批准数量不超过当前数量 |
| `inspection/convert` | 采购角色 | `returnDetailId`、`approvedActionId`、`quantity`、`idempotencyKey` | `approvedActionId` 必须指向同一明细、同一门店且 actionType 为 `INSPECTION_APPROVE` 的 `ReturnAction`；执行数量不得超过批准数量扣除已执行数量，事务内扣减并创建目标子批次 |
| `cost-verification/submit` | 采购角色 | `returnDetailId`、`batchId`、`reason`、`idempotencyKey` | 批次状态为 PENDING_VERIFICATION 或 REJECTED |
| `cost-verification/confirm` | 财务 | `returnDetailId`、`batchId`、`verifiedUnitCostCents`、`idempotencyKey` | 校验门店、成本金额和当前核验状态 |
| `cost-verification/resubmit` | 采购角色 | `returnDetailId`、`batchId`、`supplementNote`、`attachmentIds`、`idempotencyKey` | 仅允许 REJECTED 重新进入 PENDING_VERIFICATION；`supplementNote` 说明补充内容，`attachmentIds` 关联凭证附件 |
| `purchase-returns/:id/settlement/reverse` | 财务 | `settlementAdjustmentId`、`reason`、`idempotencyKey` | 结算调整必须为 CONFIRMED，原正向 PaymentRecord 存在且未冲销；actionType 固定为 `SETTLEMENT_REVERSE`；成功后只生成一条反向记录并将调整记录更新为 REVERSED |

请求体结构约束：销售创建接口的 `returnDetails` 为数组，每项必须包含 `orderItemId`、`quantity`、`reason`；采购创建接口的 `returnDetails` 为数组，每项必须包含 `purchaseOrderItemId`、`batchId`、`quantity`、`reason`；`returnDetailResults` 为数组，每项必须包含 `returnDetailId`、`actualQuantity`、`resultStatus`（`AVAILABLE`、`INSPECTION`、`DAMAGED`），待检/报损结果必须填写原因；`outboundDetails` 为数组，每项必须包含 `returnDetailId`、`batchId`、`quantity`；`approvalType` 仅允许 `BUSINESS`、`FINANCIAL`，并按对应审核类型校验字段。

所有接口均需服务端校验角色权限、`storeId`、当前状态和幂等键；前端隐藏按钮不作为权限依据。

所有状态变更接口必须：

- 退货单状态、退货明细、库存批次、库存流水、财务调整记录和审计事件必须在同一数据库事务中提交。
- 线下退款凭证只作为财务确认数据登记，系统不调用第三方支付接口。
- 每个动作必须携带 idempotencyKey；`ReturnAction.status` 取 `PENDING`、`SUCCEEDED`、`FAILED`，数据库新增 `ReturnAction`（或等价命名）动作记录表，至少保存 `returnType`、`returnId`、`returnDetailId`（明细动作必填）、`batchId`（批次动作必填）、`targetStatus`（状态转换动作必填）、`approvedQuantity`（审批动作必填）、`approvalType`（采购审核动作必填）、`settlementAdjustmentId`（结算动作必填）、`actionType`、`idempotencyKey`、请求参数摘要、执行结果摘要、状态、创建人和时间，并建立 `(returnType, returnId, actionType, idempotencyKey)` 唯一约束。请求参数摘要和执行结果摘要使用 JSON 类型；密码、凭证原文、支付账号等敏感字段必须脱敏，单字段最大长度由研发按现有审计字段上限统一确定。不得仅依赖库存流水或 PaymentRecord 实现幂等。`SETTLEMENT_REVERSE` 为供应商结算冲销动作类型；采购业务审核和财务审核分别使用 `PURCHASE_BUSINESS_APPROVE`、`PURCHASE_FINANCIAL_APPROVE`，不得使用同一 actionType 混淆两类审批。
- 重复请求必须返回首次成功结果，不得重复生成库存流水、财务调整或审计事件。首次请求失败时，同一幂等键仍返回首次失败结果，不自动重试；需要重试时必须使用新的幂等键，并重新校验当前状态和已生成的业务记录。
- 状态已被其他请求改变时，事务回滚并返回当前状态。

- 在服务端重新读取并校验当前状态；
- 支持幂等键；
- 使用事务完成单据、库存、财务和审计写入；
- 状态不匹配时返回明确错误，不覆盖其他操作结果。
- 统一错误码：`RETURN_FORBIDDEN`（无权限）、`RETURN_STORE_MISMATCH`（门店不一致）、`RETURN_INVALID_STATUS`（状态不允许）、`RETURN_INVALID_ARGUMENT`（参数校验失败）、`RETURN_IDEMPOTENCY_CONFLICT`（同幂等键请求参数不同）、`RETURN_ALREADY_REVERSED`（已冲销）；错误响应至少返回 code、message、currentStatus 和 requestId。

## 12. 页面与交互

### 12.1 销售退货页面

- 销售订单详情增加“发起退货”入口。
- 销售退货列表增加状态、日期、来源订单、客户和处理节点筛选。
- 新建页支持选择退货方式、订单明细、数量、原因、附件和退款预览。
- 审核页展示原订单金额、已收款、历史退货、申请退款和本次核定退款。
- 收货页支持按明细录入实际数量、批次、可售/待检/报损结果。
- 财务页展示原收款记录、退款方式、退款金额和退款凭证。

### 12.2 采购退货页面

- 采购订单详情和采购入库批次增加“发起退货”入口。
- 新建页只展示有可退数量的采购批次。
- 审核页展示采购成本、可退数量、申请金额和结算方式。
- 出库页支持按批次扫码或选择批次，录入实际出库数量。
- 结算页支持供应商退款、应付抵扣、换货结果登记和部分结算；不生成自动换货入库任务。

### 12.3 通用页面状态

- 部分取消状态：详情页必须展示已执行数量、剩余未执行数量、已退款/已结算金额和“取消剩余”按钮；销售退货仅店长可用，采购退货由店长或采购负责人可用，服务端按角色和 `storeId` 强制校验。

- 加载状态：展示骨架或加载提示，禁止重复提交。
- 空状态：明确显示“暂无退货单”并根据权限显示创建入口。
- 无权限：不展示敏感金额和执行按钮，并返回服务端权限错误。
- 数据失效：对象已被其他人处理时，提示刷新并重新加载当前状态。

## 13. 异常与边界情况

| 场景 | 系统处理 | 用户反馈 |
|---|---|---|
| 订单/采购单不属于当前门店 | 拒绝读取和操作 | 无权限或来源单不存在 |
| 退货数量超过可退数量 | 拒绝提交 | 展示可退数量和历史退货数量 |
| 审核后库存不足 | 拒绝执行库存变更 | 提示库存已变化，要求重新调整 |
| 重复点击提交/执行 | 使用幂等键返回首次结果 | 不重复生成流水 |
| 状态已被他人改变 | 拒绝旧状态操作 | 提示刷新详情 |
| 财务退款金额超过核定金额 | 拒绝确认 | 提示最大可退款金额 |
| 供应商确认金额小于申请金额 | 允许部分结算 | 强制填写差异原因 |
| 退货单取消后继续执行 | 拒绝执行 | 提示单据已取消 |
| 销售实物退货判定为报损 | 不增加可用库存 | 生成报损待处理记录 |
| 线下退款已完成但凭证未上传或确认失败 | 保留待确认状态，不重复记账 | 提示财务补充凭证并人工核验 |
| 退货单已关闭需修改 | 禁止直接编辑 | 引导红冲或反向单据 |
| 跨店订单退货 | 以实际执行门店库存为准 | 显示来源门店和执行门店 |

## 14. 审计与数据追溯

以下事件必须记录审计事件：

- 创建退货单；
- 修改草稿；
- 提交、审核、驳回、取消；
- 实际收货或出库；
- 库存判定为可售、待检、报损；
- 修改退款/结算金额；
- 退款、供应商退款、应付抵扣、换货确认；
- 红冲和反向单据。

审计记录至少包含：操作者、门店、对象类型、对象 ID、原状态、新状态、原值、新值、原因和时间。

## 15. 数据指标与埋点

本期先建设数据口径，目标值待业务确认。

| 指标 | 口径 | 目标值 |
|---|---|---|
| 销售退货单闭环率 | 已关闭销售退货单 / 已创建销售退货单 | 待确认 |
| 采购退货单闭环率 | 已关闭采购退货单 / 已创建采购退货单 | 待确认 |
| 超数量退货拦截数 | 被数量校验拒绝的提交次数 | 记录趋势 |
| 退货库存差异数 | 单据数量与库存流水数量不一致的单据数 | 0 |
| 待退款超时数 | 已收货待退款超过财务约定时限的单据数 | 待确认 |
| 供应商结算差异金额 | 申请金额与确认金额差异总额 | 记录趋势 |

建议埋点：创建退货、提交退货、审核通过、审核驳回、完成收货、完成出库、确认退款、确认供应商结算、取消退货、重复提交拦截、数量校验失败。

## 16. 验收标准

### 16.1 销售退货正常流程

- Given：销售订单已完成且存在未退商品
- When：销售/客服选择一条明细并提交部分退货
- Then：系统生成销售退货草稿，展示可退数量，提交后进入“已提交”。

- Given：销售退货已审核，实物退回数量为 2，验收结果为可售
- When：采购角色确认收货
- Then：库存可用数量增加 2，生成一条 `RETURN_IN`，来源为该销售退货单，单据进入退款等待状态。

- Given：销售退货选择不退货直接退款且已审核
- When：财务确认退款
- Then：系统生成退款/收款冲销记录，不生成 `RETURN_IN`；全额退款进入“已退款”，部分退款进入“部分退款”，并写入剩余待退款金额。

### 16.2 采购退货正常流程

- Given：采购订单已入库，某批次可用数量为 10
- When：采购申请退货 3 并审核通过，采购角色执行出库
- Then：库存可用数量减少 3，生成一条 `RETURN_OUT`，来源为该采购退货单，单据进入待结算状态。

- Given：采购退货默认结算方式为应付抵扣
- When：财务确认供应商抵扣金额
- Then：系统生成供应商结算记录，保存抵扣金额和供应商凭证，全部处理后单据关闭。

### 16.3 校验与权限

- Given：历史退货和未关闭申请已占用全部可退数量
- When：用户再次提交退货
- Then：服务端拒绝提交并返回可退数量为 0。

- Given：调用销售或采购状态变更接口时用户角色不在接口权限矩阵内；When：服务端处理请求；Then：返回 `RETURN_FORBIDDEN`，不修改任何业务数据。
- Given：施工角色登录
- When：访问退货列表或调用退货执行接口
- Then：页面不可进入，接口返回无权限，不能读取退款和供应商结算金额。

- Given：同一执行请求重复提交
- When：服务端收到相同幂等键
- Then：只生成一份库存流水和一份财务记录，重复请求返回首次执行结果。

- Given：待检商品无法追溯原销售出库批次；When：采购角色完成收货；Then：系统创建 INSPECTION 子批次，使用订单材料成本快照并标记成本待核验。
- Given：待检子批次数量为 5，审核通过转可售 3；When：采购角色执行转状态；Then：原 INSPECTION 子批次数量为 2，新建 AVAILABLE 子批次数量为 3，库存总量不变，并生成 SALES_RETURN_INSPECTION 调整流水。
- Given：已有历史 STOCK_OPERATION 退货流水；When：用户查询库存流水；Then：历史记录可查看；当用户新建同类手工退货时，服务端拒绝请求。
- Given：调用采购退货审核接口且 `approvalType=BUSINESS`；When：财务用户提交请求；Then：返回 `RETURN_FORBIDDEN`，不改变业务审核状态。
- Given：调用采购退货审核接口且 `approvalType=FINANCIAL`；When：店长提交请求；Then：返回 `RETURN_FORBIDDEN`，不改变财务审核状态。
- Given：同一退货动作使用相同 returnId、actionType 和 idempotencyKey 重试；When：服务端处理请求；Then：返回首次结果，不重复写入状态、库存、财务和审计记录。
- Given：同一幂等键的首次请求执行失败；When：客户端使用相同幂等键再次请求；Then：返回首次失败结果，不重复执行；客户端改用新幂等键重试时，服务端重新校验当前状态和已生成记录。

### 16.4 规则补充验收

- Given：订单完成时间已超过 30 个自然日；When：用户发起销售退货；Then：系统拒绝创建并提示退货期限已过。

- Given：销售退货已收货但只确认部分退款；When：财务再次打开单据；Then：系统展示核定退款、历史已退款和待退款金额，并允许确认剩余退款。

- Given：销售退货验收结果为待检；When：采购角色完成收货；Then：商品进入独立待检库存，不增加可用库存，不能被锁库、销售或用于施工。

- Given：实际退款、退货数量或批次发生变化；When：系统生成收入、成本或提成调整；Then：调整记录必须关联退货单和退货明细，并保留原值、新值和计算依据。
### 16.5 异常处理

- Given：审核后库存被其他业务占用
- When：采购角色执行退货
- Then：事务整体失败，不产生部分扣减和退货流水，并提示库存已变化。

- Given：采购退货申请金额为 1000 元，供应商只确认 800 元
- When：财务确认结算
- Then：系统允许部分结算，要求填写 200 元差异原因，未结算金额继续保留。

- Given：销售退货已收货，核定退款 1,000 元，首次退款 600 元；When：财务确认退款；Then：单据进入“部分退款”，refundedAmountCents=600，remainingRefundCents=400。
- Given：销售退货处于“部分退款”，客户放弃剩余 400 元；When：财务填写放弃原因并确认；Then：系统写入 waivedRefundCents=400，单据进入“已关闭”，不得再次退款。
- Given：待检库存数量为 5，店长审核转可售 3；When：采购角色调用转换接口；Then：原待检子批次数量为 2，新建可售子批次数量为 3，库存总量不变，并生成 sourceType=SALES_RETURN_INSPECTION 的库存调整流水。
- Given：采购退货使用 MIXED 结算，退款 300 元、应付抵扣 500 元、换货 1 件；When：财务确认结算；Then：结算调整记录分别保存退款、抵扣和换货字段，PaymentRecord 仅关联 300 元退款。
- Given：采购退货已出库且供应商仅确认换货；When：采购登记换货完成且无待确认金额；Then：单据进入“已结算”，随后进入“已关闭”。
- Given：销售退货已审核但尚未收货；When：店长取消单据；Then：仅释放未执行数量，不生成库存或财务冲销流水。
- Given：实际退款已确认；When：系统生成调整；Then：收入冲减、材料成本冲减、提成扣减和收款冲销均关联退货单及明细，且同一幂等键不重复生成。

- Given：待检转报损数量为 2；When：采购角色执行转换；Then：原 INSPECTION 子批次数量扣减 2，新建 DAMAGED 子批次 2，生成 DAMAGE_OUT，不增加可用库存。
- Given：销售退货已部分收货；When：店长取消剩余未执行数量；Then：单据进入“部分取消”，已收货数据保留，剩余数量释放，待已执行部分退款完成后进入“已关闭”。
- Given：采购退货已部分出库；When：店长取消剩余未执行数量；Then：单据进入“部分取消”，已出库数据保留，剩余数量释放，待已执行部分结算完成后进入“已关闭”。
- Given：供应商退款已确认；When：系统生成 PaymentRecord；Then：sourceType=SUPPLIER_RETURN_SETTLEMENT，sourceId 指向结算调整记录，账户为实际执行门店财务账户。
- Given：退货成本状态为 PENDING_VERIFICATION；When：财务确认成本；Then：状态变为 VERIFIED，并生成成本差异调整记录，不修改原始库存流水。

- Given：结算调整记录状态为 PENDING；When：财务确认供应商退款；Then：记录状态变为 CONFIRMED，按 sequenceNo 计入 PurchaseReturn 汇总，并生成 type=SUPPLIER_REFUND_OUT、direction=OUTFLOW 的 PaymentRecord。
- Given：成本核验状态为 PENDING_VERIFICATION；When：财务驳回并填写原因；Then：状态变为 REJECTED，采购补充材料后可重新提交为 PENDING_VERIFICATION。
- Given：请求参数或执行结果包含凭证原文或支付账号；When：系统写入 ReturnAction；Then：摘要中的敏感字段已脱敏，且重复请求仍按唯一幂等键返回首次结果。
- Given：采购退货处于部分取消；When：用户打开详情；Then：页面展示已出库数量、剩余未执行数量、已结算金额和取消剩余按钮。

- Given：已确认供应商退款需要撤销；When：财务调用 `settlement/reverse` 并提交原因；Then：原 PaymentRecord 金额和原始状态保持不变，生成唯一的 `SUPPLIER_REFUND_REVERSAL + INFLOW` 反向记录，金额等于原记录，`reversalOfId` 指向原记录，结算调整记录变为 `REVERSED`，采购退货按剩余有效结算金额回到对应结算状态，重复冲销被拒绝。
- Given：成本核验批次为 REJECTED；When：采购提交 `returnDetailId`、`batchId` 和补充材料；Then：批次状态变为 PENDING_VERIFICATION，财务可继续确认。
- Given：采购角色调用 `cost-verification/confirm`；When：服务端处理请求；Then：接口返回无权限，不能修改成本状态。
- Given：Phase 1 执行待检转可售或转报损；When：库存状态转换完成；Then：分别生成 `STOCK_ADJUST` 或 `DAMAGE_OUT`，并纳入退货单事务和审计。

## 17. 待确认与技术评估事项

| 编号 | 事项 | 影响范围 | 状态 |
|---|---|---|---|
| 1 | 总部审批金额阈值和总部角色名称 | 权限、审批流 | 本期不启用总部审批；总部角色矩阵发布后再评估 |
| 2 | 退款是否需要对接第三方支付 | 财务接口 | 已确认：本期不接入，线下退款后系统登记 |
| 3 | 销售退货后的提成、收入和成本报表口径 | 财务、报表、提成 | 已确认：按实际退款、批次成本和退货商品金额比例处理 |
| 4 | 待检库存如何落地为库存状态、批次和仓位 | 库存模型 | 已确认：独立子批次 + inventoryStatus |
| 5 | 采购换货是否在本期实现自动重新入库 | 采购、库存 | 已确认：本期只登记换货结果，自动配货和自动入库属于 Phase 3 |
| 6 | 销售退货窗口是否支持按产品或订单类型配置 | 参数配置 | 已确认：默认订单完成后 30 天，本期不配置化 |
| 15 | 待退款超时的财务时限 | 指标、提醒 | 上线前由财务确认配置项；未配置时仅统计不触发提醒 |
| 7 | 部分退款是否允许多次确认及放弃剩余退款 | 状态、财务 | 已确认：允许多次退款；放弃剩余退款需财务填写原因 |
| 8 | 销售退货使用来源门店还是实际执行门店 | 库存、跨店 | 已确认：实际执行门店负责收货和库存变化 |
| 9 | 库存执行人员与现有采购角色的映射 | 权限 | 已确认：本期复用采购角色 |
| 10 | 普通手工 RETURN_IN/RETURN_OUT 是否禁止创建新退货流水 | 库存、审计 | 已确认：新退货流水必须来源于退货单，历史流水保留查询 |
| 11 | 供应商退货结算调整记录如何与现有财务模型关联 | 财务、研发 | 已确认：新增 SupplierReturnSettlementAdjustment；实际退款同步 PaymentRecord，应付抵扣只写调整记录 |
| 12 | 退货单驱动库存流水后，普通手工退货接口的兼容策略 | 库存、研发 | 已确认：服务端拒绝新建，历史流水只读保留 |
| 13 | 退货事务和幂等策略 | 研发、测试 | 已确认：同一数据库事务；按 returnType + returnId + actionType + idempotencyKey 唯一 |
| 14 | PaymentRecord 的供应商退款类型、账户方向和 sourceId 关系 | 财务、研发 | 已确认：sourceType=SUPPLIER_RETURN_SETTLEMENT、type=SUPPLIER_REFUND_OUT、direction=OUTFLOW、执行门店财务账户；如现有枚举不存在则新增 |

## 18. 实施拆分建议

### 交付阶段边界

- Phase 1 必须交付：退货单、审批、收货/出库、库存流水、`ReturnAction` 幂等记录、销售退款确认及收入/成本/提成/收款冲销调整记录接口；供应商退款完成结算调整记录、基础 `PaymentRecord`（`SUPPLIER_REFUND_OUT`）写入及财务结算冲销（`SETTLEMENT_REVERSE`）；线下退款凭证只登记，不调用第三方支付。
- Phase 2 交付：将 Phase 1 的供应商退款 PaymentRecord 接入应付余额、总账、财务报表、对账和供应商绩效；应付抵扣的正式账务映射也在 Phase 2 完成，不得反向修改 Phase 1 的退货库存闭环。
- 本 PRD 的业务验收覆盖 Phase 1；Phase 2 的财务增强作为后续发布，不得影响 Phase 1 退货单和库存闭环。

### Phase 1：单据与库存闭环

- Prisma 模型、迁移和状态枚举；
- 收入、材料成本、提成和收款冲销的调整记录接口；
- 销售退货、采购退货服务和控制器；
- 数量、门店、批次和幂等校验；
- 退货单驱动 `RETURN_IN/RETURN_OUT`，待检状态转换驱动 `STOCK_ADJUST/DAMAGE_OUT`；
- 权限、审计和后端测试。

### Phase 2：财务闭环


- 供应商退款与应付抵扣的正式账务映射及结算差异处理；
- 财务页面和财务权限；
- 财务流水、报表和对账测试。

### Phase 3：增强场景

- 换货；

- 跨门店退货；
- 总部审批阈值配置；（总部角色矩阵发布后重新评估，本期不启用）
- 退货分析报表和供应商绩效。

## 19. 变更记录

| 版本 | 日期 | 变更内容 | 修改人 |
|---|---|---|---|
| v2.6 | 2026-07-30 | 根据复评补充创建明细结构、销售退款方式与凭证字段，并统一退款接口字段命名 | Codex |
| v2.5 | 2026-07-30 | 补充销售和采购退货创建接口的权限、请求字段和校验规则，完成全部 POST 业务接口矩阵 | Codex |
| v2.4 | 2026-07-30 | 明确采购双阶段审核的 ReturnAction approvalType 和 actionType，避免幂等与审计混淆 | Codex |
| v2.3 | 2026-07-30 | 补充销售/采购核心接口权限与请求参数矩阵、ReturnAction 目标字段、统一错误码和接口验收规则 | Codex |
| v2.2 | 2026-07-30 | 根据继续评审明确财务权限、冲销后单据状态、Phase 1 范围、失败幂等重试、PaymentRecord 关系字段和附件校验，并补充验收用例 | Codex |
| v2.1 | 2026-07-30 | 根据评审结果补充供应商结算冲销接口、PaymentRecord 原记录与反向记录关系、approvedActionId 校验和成本核验补充材料字段，并修正版本号 | Codex |
| v2.0 | 2026-07-30 | 根据评审结果补充反向 PaymentRecord、成本核验请求体与权限矩阵、ReturnAction 状态、Phase 1 流水范围和部分取消权限 | Codex |
| v1.9 | 2026-07-30 | 根据继续评审冻结 PaymentRecord 枚举和阶段边界，补充结算记录生命周期、审批角色、成本驳回、幂等脱敏和部分取消页面规则 | Codex |
| v1.8 | 2026-07-30 | 根据继续评审统一库存流水类型，补充部分取消状态、待检审核记录、子批次数量、成本核验闭环和供应商退款记账默认映射 | Codex |
| v1.7 | 2026-07-30 | 根据继续评审补充 sourceType、待检转换接口、结算拆分、审批顺序、取消规则、换货终态和阶段边界 | Codex |
| v1.6 | 2026-07-30 | 根据需求评审修复部分待检转可售的批次拆分规则，补充结算主记录、PaymentRecord 映射、ReturnAction 幂等落库和 Phase 1/2 边界 | Codex |
| v1.5 | 2026-07-30 | 确认并补充库存子批次、供应商结算模型、事务幂等和历史数据兼容技术方案 | Codex |
| v1.4 | 2026-07-30 | 根据再次评审补齐部分退款状态、财务调整对象、供应商累计结算和阶段边界 | Codex |
| v1.3 | 2026-07-30 | 同步确认财务冲减、待检库存、供应商结算和跨店归属规则 | Codex |
| v1.2 | 2026-07-30 | 根据需求评审补齐部分处理闭环、财务口径建议、批次归属和待检库存规则 | Codex |
| v1.1 | 2026-07-30 | 补充并确认审批、退款、待检库存、换货和退货窗口规则 | Codex |
| v1.0 | 2026-07-30 | 根据已确认的销售退货、采购退货方案建立 PRD | Codex |
