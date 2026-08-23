# OperationalReport（运营报表执行面）深化 PRD

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 目标 | 在不改变报表业务口径的前提下，收拢 summary 与 operational 的读取 seam |
| 目标角色 | 总部管理者、门店管理者、运营与财务查看人员 |
| 设计依据 | `apps/api/src/reports/reports.service.ts`、`reports.controller.ts`、ADR-0001 |
| 本期原则 | 沿用 ADR-0001；实时查询；不新增物化报表 |

## 2. 背景与目标

现有 Operational Report module 已拥有摘要、完整明细、筛选项、范围解析、事实日期、成本完整性、收款状态和趋势分析，但 controller 仍直接依赖 implementation，并重复部分访问前置判断。summary 与 operational 的成本、粒度和查询代价不同，需要明确两个读取 interface，同时共享内部口径规则。

本期不是重新定义报表指标，而是让 Operational Report module 成为唯一的报表语义与执行 seam：范围解析、日期口径、成本口径、查询组合、上限和结果状态集中在 module 内部。

非目标：不改变 ADR-0001；不新增物化读模型；不修改默认日期口径、366 天上限、2000 条明细上限或成本不完整状态；不拥有订单、库存、结算事实。

## 3. 核心读取对象

- Summary：轻量摘要、趋势、状态和洞察，用于运营总览。
- Operational report：带筛选、明细、比较、成本和收款维度的完整结果。
- Filter options：受访问范围约束的筛选项集合。
- Report scope：由访问主体和请求门店共同解析出的实际门店范围。

## 4. 业务口径

1. 报表使用事实发生日期；默认口径保持现状：订单使用订单日期，付款使用实际收款日期，售后使用售后创建日期。
2. 支持现有 `DEFAULT`、`ORDER`、`APPOINTMENT`、`CONSTRUCTION_COMPLETED`、`SETTLEMENT` 日期口径。
3. 日期范围必须合法且不超过 366 天；不完整日期不静默回退。
4. 成本来源保持“实际、标准、待补齐”；成本不完整时结果明确标记 partial/错误码，不伪造毛利。
5. 明细返回保持 2000 条上限；超限继续沿用现有实现的 capped/truncated 完整性事实和总量口径，不新增游标；controller 不截断。
6. summary 与 operational 可以共享内部查询 adapter 和口径函数，但结果粒度和性能约束分别由各自 interface 保证。

## 5. 权限与数据范围

- module 根据访问主体和请求门店解析实际范围。
- 请求传入未授权门店时拒绝，不返回空数据掩盖越权。
- 总部、门店和本人责任范围继续遵循现有访问上下文，不由页面筛选条件扩大。
- filterOptions 与 report 结果使用同一 scope 解析，避免筛选项与结果范围不一致。

## 6. 异常与边界

| 场景 | 结果 |
|---|---|
| 日期格式非法 | 明确日期错误 |
| 起止日期倒置 | 明确范围错误 |
| 范围超过 366 天 | 明确上限错误 |
| 无授权门店 | 拒绝，不泄露数据 |
| 无数据 | 返回空但结构完整的结果 |
| 缺少业务日期 | 计入缺失统计，不静默使用更新时间 |
| 成本不完整 | 返回 partial 状态和 `COST_INCOMPLETE` 等现有错误事实 |
| 某一查询 adapter 失败 | 整体返回明确失败，不输出部分伪完整指标 |

## 7. interface 与 seam 约束

- 对外明确 summary interface、operational interface 和 filter options interface 的结果粒度与成本特性。
- controller 不重复解析访问范围、日期或成本；这些规则集中在 module 内部。
- Prisma 查询与聚合函数作为内部 query adapter，不暴露给调用方。
- contract test 通过三个读取 interface 验证口径、权限、上限、完整性和空结果。
- adapter 失败沿用现有错误协议；新增错误码必须进入统一错误目录，不在 controller 临时拼接。

## 8. 验收标准

- Given 同一访问主体和门店筛选，When 请求 filterOptions 与 operational，Then 两者使用同一实际范围。
- Given 查询范围超过 366 天，When 请求 summary 或 operational，Then 均返回同一范围错误。
- Given 订单缺少所选业务日期，When 请求报表，Then 记录缺失统计，不使用更新时间替代。
- Given 成本资料不完整，When 请求毛利指标，Then 返回 partial 状态和明确错误码，不把缺失成本当作零。
- Given 明细超过 2000 条，When 请求 operational，Then 返回既定上限结果并明确截断/限制事实。
- Given 无权访问请求门店，When 请求任一读取 interface，Then 被拒绝且不返回门店数据。
- Given 无数据，When 请求 summary 或 operational，Then 返回可渲染的空结果结构。
- contract test 不需要进入 Prisma 查询细节即可验证上述规则。

## 9. 迁移与删除顺序

1. 先锁定 summary、operational、filterOptions 的 contract test，包含日期、成本、范围和 capped/truncated 事实。
2. controller 单向切换到报表 interface，保留外部查询参数和响应兼容 adapter。
3. 静态搜索确认没有其他调用方自行解析范围、日期或成本口径后，删除旧的重复逻辑。
4. 迁移失败时回滚兼容 adapter，不恢复第二条报表语义实现。

## 10. 依赖与风险

- 依赖订单、付款、售后、施工、库存、返利和成本事实的现有读取模型。
- 依赖 ADR-0001 的 Operational Report module 语义所有权。
- 风险：查询成本随指标增加而增长；本阶段用 interface 成本约束和观测记录风险，不引入物化读模型。
