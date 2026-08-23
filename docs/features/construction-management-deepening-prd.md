# 施工管理能力 seam 深化 PRD

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 需求名称 | 施工管理能力 seam 深化 |
| 文档版本 | V1.1 |
| 当前状态 | 已确认，可进入实施 |
| 创建日期 | 2026-08-23 |
| 关联代码 | `apps/api/src/construction/construction.service.ts`、`construction.controller.ts`、`construction.module.ts` |
| 关联决策 | ADR-0002、ADR-0006、ADR-0011、ADR-0012、ADR-0016 |

## 2. 需求背景

`ConstructionFulfillment` 已收口订单履约读取和履约命令，但 `ConstructionService` 仍混合容量、人员、请假、排班、证据、材料和离线入口。管理端点继续直接依赖旧 service，造成履约 authority 与管理能力之间的 interface 认知负担。

本期只深化“施工管理能力”，为旧 service 的管理部分建立清晰 seam，不重新打开 `ConstructionFulfillment` 的履约 ownership。

## 3. 产品目标

- 容量、人员、请假和排班共用稳定的施工管理 seam。
- 管理端点不再直接依赖 `ConstructionService` 的宽 public surface。
- 施工履约、施工证据、材料和库存事实保持既有 owner。
- 旧 `ConstructionService` 仅作为内部 implementation，完成后不再 public export。

## 4. 本期范围与非目标

### 包含

- 容量：查询、创建/更新和对账入口。
- 人员：施工人员档案查询与维护。
- 请假：创建、查询、更新及既有幂等语义。
- 排班：创建/更新与查询。
- controller 迁移、contract test、静态删除测试和回归。

### 不包含

- 派工、开工、完工、质检、最终交付和跨店履约；这些属于 `ConstructionFulfillment`/`OrderLifecycle`。
- 施工照片、施工证据纠正和质量历史；遵守 ADR-0011，另行评估。
- 材料核验、领料、损耗和库存流水；库存事实继续由 `InventoryLedger` 拥有。
- 离线同步 public seam；请假离线操作只保留为内部传输适配，不能扩大管理 seam。

## 5. 核心对象

| 对象 | 定义 | 管理动作 |
|---|---|---|
| 日容量 | 某门店某日可承载的施工能力事实 | 查询、设置、更新、对账 |
| 施工人员档案 | 施工人员在门店的管理资料 | 查询、维护 |
| 请假申请 | 施工人员的请假申请及审批状态 | 创建、查询、更新 |
| 排班 | 门店施工人员在日期/时段的安排 | 创建/更新、查询 |

对象状态和枚举沿用当前 Prisma schema 与既有业务行为，不在本期新增状态。

## 6. 业务流程与规则

### 6.1 容量

1. 具备门店管理能力的主体查询或提交指定门店/日期容量。
2. seam 校验门店范围和容量字段。
3. 设置/更新成功后返回当前容量记录；对账只修复容量与履约记录之间的既有差异，不推进订单履约。

### 6.2 人员、请假、排班

- 人员维护必须属于授权门店，不能通过管理 seam 改变订单履约状态。
- 请假创建/更新沿用当前申请人、审批人和 client operation 幂等规则。
- 排班写入必须校验门店、人员和时间范围；查询只返回访问主体可见门店数据。
- 请假或排班变化不会自动写订单履约或库存事实。

## 7. 权限与数据范围

| 角色 | 可查看 | 可操作 |
|---|---|---|
| 店长/管理者 | 授权门店容量、人员、请假、排班 | 对应门店管理动作 |
| 排班员 | 授权门店人员、请假、排班 | 请假/排班管理，按现有能力矩阵 |
| 施工人员 | 本人档案、本人请假和排班结果 | 本人允许的请假动作 |
| 其他主体 | 由 `AccessContext` 决定 | 无能力时稳定拒绝 |

不使用 `isAuditor` 或 `PermissionPolicy` fallback；能力和门店范围统一由 `AccessContext` 计算。

## 8. 异常与边界

- 门店或人员不属于访问范围：拒绝且不返回跨门店数据。
- 容量、排班时间或请假字段不合法：不写入部分结果。
- 同一 client operation 重放：返回原结果；同键不同请求摘要拒绝。
- 并发修改同一管理记录：遵守现有唯一约束/状态条件，失败不覆盖他人更新。
- 管理动作尝试调用履约、证据或库存写入：不允许通过该 seam 进入。

## 9. 验收标准

- Given 管理者拥有门店 S 的施工管理能力，When 查询容量和排班，Then 只返回门店 S 的管理结果。
- Given 管理者提交合法容量，When 执行设置，Then 返回当前容量记录且不改变任何订单履约状态。
- Given 施工人员提交带 client operation 的请假申请，When 相同请求重放，Then 返回原申请且不生成重复记录。
- Given 排班人员不属于目标门店范围，When 修改该门店排班，Then 请求拒绝且数据不变。
- Given controller 迁移完成，When 扫描生产代码，Then 管理端点不再直接引用 `ConstructionService` public interface。
- Given 删除旧 module export 后运行全量测试，When 执行 API typecheck、build 和测试，Then 管理能力行为保持不变且履约、库存相关 contract test 继续通过。

## 10. 阶段门

1. 施工管理 contract test 覆盖四类管理对象、权限、幂等和错误。
2. 容量、人员、请假、排班 controller 调用迁移；履约、证据、材料、离线调用不误迁移。
3. `ConstructionModule` 不再 exports `ConstructionService`，静态引用与 deletion test 通过。
4. API typecheck、Nest build、全量 API tests 和施工管理代表页面验收通过。

## 11. 待确认事项

无业务阻塞项。施工证据、材料和离线同步在本期明确延期，不以管理 seam wrapper 形式提前吸收。
