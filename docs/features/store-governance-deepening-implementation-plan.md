# StoreGovernance 深化实施计划

## 1. 目标

把门店组织生命周期和组织配置收拢到 `StoreGovernance` seam，将公开目录、工作台详情和施工资格作为读取契约，保持现有门店 use case 为内部 adapter。

## 2. 实施步骤

1. 新增门店治理 token 与管理契约，以及公开目录、工作台、施工资格读取契约。
2. 以 `useExisting` 绑定现有 `StoresService`，复用四个已存在的生命周期 use case。
3. 迁移 `StoresController` 的管理员命令/查询和店长提交入口到治理 seam；公开与施工读取迁移到相应读取契约。
4. 保证审核拒绝按历史批准提交回到 `PUBLISHED` 或 `DRAFTED`；冻结/解冻只允许合法状态；通知失败不回滚门店状态。
5. 增加门店状态冲突、店长唯一性、财务主体和施工资格 contract tests。
6. 运行 API typecheck、Nest build、门店/施工相关测试和全量 API 测试。

## 3. 文件范围

- 新增：`apps/api/src/stores/domain/store-governance.ts`、必要的读取契约文件
- 修改：`stores.controller.ts`、`stores.module.ts`、必要的实现/测试文件
- 不修改：Prisma schema、现有路由、OSS 上传行为、施工模块的门店写入职责

## 4. 完成标准

- 门店治理规则有单一外部 seam，公开/工作台/施工资格读取不被管理命令 interface 污染。
- `ConstructionFulfillment` 只读取门店资格，不写门店组织配置。
- 审核、冻结、店长变更的状态与异常规则可通过 seam 直接验收。
- 无迁移、无双写，构建与回归测试通过。

