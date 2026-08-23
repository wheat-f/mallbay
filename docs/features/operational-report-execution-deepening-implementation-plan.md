# OperationalReport｜实施计划

## 1. 实施目标

在 ADR-0001 约束下，将 summary、operational、filterOptions 的范围解析、事实日期、成本口径、上限和完整性收拢到 Operational Report module 的读取 interface。

## 2. 实施顺序

1. **建立 contract test**：覆盖 summary/operational/filterOptions 同范围、日期口径、366 天上限、成本 partial、无授权、空结果和 capped/truncated 事实。
2. **建立读取 seam**：controller 只依赖三个读取 interface；范围解析、日期验证、成本完整性和结果组装保留在 module 内部。
3. **收拢查询 adapter**：Prisma 查询与聚合函数作为内部 query adapter，不修改订单、付款、售后、施工、库存和成本事实所有权。
4. **保持结果兼容**：沿用现有查询参数、错误协议、日期口径和响应字段；补齐已有 capped/truncated 完整性事实，不新增物化读模型。
5. **迁移 controller**：删除 controller 的重复访问前置判断和口径解析，单向通过报表 interface。
6. **删除旧路径**：静态搜索调用方自建 scope/date/cost 规则，确认没有第二条报表语义实现后删除重复逻辑。

## 3. 预计文件范围

- `apps/api/src/reports/reports.service.ts`
- `apps/api/src/reports/reports.controller.ts`
- `apps/api/src/reports/reports.module.ts`
- `apps/api/src/reports/dto/reports.dto.ts`
- `apps/api/src/reports/*contract*.test.ts`
- `docs/adr/0001-operational-report-module.md`（仅在发现既有约束文字需补充时修改）

## 4. 关键实现约束

- 不修改 ADR-0001 的语义所有权。
- 不改变默认日期口径、日期可选值、366 天上限和成本完整性语义。
- 2000 条明细上限沿用现有 capped/truncated 事实和总量口径，不新增游标。
- 缺失业务日期不能回退到更新时间；无权门店不能返回空数据掩盖越权。

## 5. 验证与回滚

- 先运行报表 contract tests，再运行 reports typecheck/build 和 API 全量测试。
- 对比迁移前后相同 fixture 的 summary、operational、filterOptions 响应和错误协议。
- 静态搜索 controller/其他 module 中的范围、日期、成本重复解析。
- 失败时回滚读取 interface 的兼容 adapter，不恢复第二条报表语义实现。
