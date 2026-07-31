# MallBay 文档索引

本文档是 MallBay 项目文档入口。新增文档前请先阅读 [DOCUMENTATION_GUIDELINES.md](./DOCUMENTATION_GUIDELINES.md)。
> 当前实现以 [current-system-overview.md](./current-system-overview.md) 为准。`phase-*`、`*-plan`、`*-review` 和 `qa/release-evidence` 文档主要保留历史方案、实施记录或发布证据，不代表全部当前行为。

## 当前实现与研发入口

- [current-system-overview.md](./current-system-overview.md)：当前代码、业务流程、环境、迁移和验证命令的权威概览。
- [features/order-end-to-end-flow-optimization-prd-final.md](./features/order-end-to-end-flow-optimization-prd-final.md)：订单全流程优化的最终 PRD和已确认业务规则。
- [qa/end-to-end-flow-checklist.md](./qa/end-to-end-flow-checklist.md)：当前端到端验收清单。

## 文档目录

- [DOCUMENTATION_GUIDELINES.md](./DOCUMENTATION_GUIDELINES.md)：文档分类、命名、维护和评审规范。

### 治理规范

- [governance/ARCHITECTURE.md](./governance/ARCHITECTURE.md)：架构边界、分层规则和模块职责。
- [governance/CONTRIBUTING.md](./governance/CONTRIBUTING.md)：分支、提交、PR、评审和协作规则。
- [governance/CODE_STYLE.md](./governance/CODE_STYLE.md)：TypeScript、NestJS、React、Prisma 编码规范。
- [governance/API_GUIDELINES.md](./governance/API_GUIDELINES.md)：REST API、错误、分页、鉴权和版本策略。
- [governance/REFACTOR_PLAN.md](./governance/REFACTOR_PLAN.md)：当前问题清单和渐进式改造路线。

### 架构图

- [diagrams/README.md](./diagrams/README.md)：PlantUML 图索引，包含系统上下文、运行架构、核心领域 ER、系统完整业务流程和采购到货验收时序图。

### 功能方案与实施计划

- [features/product-pricing-purchase-cost-vehicle-unified-design.md](./features/product-pricing-purchase-cost-vehicle-unified-design.md)：产品建议价、单位换算、车辆类型、材料成本、采购单价、实际入库价和成本差异的统一设计方案。
- [features/sales-order-pricing-engine-implementation-plan.md](./features/sales-order-pricing-engine-implementation-plan.md)：销售订单智能建议价、价格规则、报价审批与毛利保护实施计划。
- [features/sales-order-construction-charge-cost-implementation-plan.md](./features/sales-order-construction-charge-cost-implementation-plan.md)：销售订单施工收费、标准工时、预计/实际成本、毛利与结算调整实施计划。
- [features/sales-order-pricing-and-construction-charge-guide.md](./features/sales-order-pricing-and-construction-charge-guide.md)：产品建议价与施工收费的功能边界、计算关系和典型使用场景。
- [features/sales-order-pricing-construction-charge-operation-manual.md](./features/sales-order-pricing-construction-charge-operation-manual.md)：店长、财务和销售的产品建议价与施工收费操作手册。
- [features/MallBay-产品建议价与施工收费操作手册-使用人员版.docx](./features/MallBay-产品建议价与施工收费操作手册-使用人员版.docx)：面向店长、财务和销售的一线使用人员 Word 操作手册。
- [qa/sales-order-pricing-checklist.md](./qa/sales-order-pricing-checklist.md)：销售订单建议价与价格审批自动化、人工验收和数据库演练清单。
- [qa/sales-order-construction-cost-checklist.md](./qa/sales-order-construction-cost-checklist.md)：施工收费、预计/实际成本、权限、导出、灰度与回滚验收清单。
- [features/paint-protection-film-system-plan.md](./features/paint-protection-film-system-plan.md)：漆面保护膜施工管理系统 V1.7 需求建设方案。
- [features/v1-7-requirements-gap-plan.md](./features/v1-7-requirements-gap-plan.md)：V1.7 全功能需求差距与验收计划。
- [features/v1-7-local-verification-audit.md](./features/v1-7-local-verification-audit.md)：V1.7 本地验收审计。
- [features/prototype-ui-optimization-plan.md](./features/prototype-ui-optimization-plan.md)：基于最新 Stitch 原型的 UI 信息架构优化方案。
- [features/order-requirements-alignment-plan.md](./features/order-requirements-alignment-plan.md)：订单创建与 V1.7 需求对齐实施计划。
- [features/phase-1-customers-orders-plan.md](./features/phase-1-customers-orders-plan.md)：Phase 1 客户、产品、订单和收款实施计划。
- [features/phase-1-customers-orders.md](./features/phase-1-customers-orders.md)：Phase 1 客户、订单、产品和收款功能说明。
- [features/phase-2-construction-plan.md](./features/phase-2-construction-plan.md)：Phase 2 施工容量、派单与施工记录实施计划。
- [features/phase-2-construction.md](./features/phase-2-construction.md)：Phase 2 施工容量、派单与施工记录功能说明。
- [features/phase-3-inventory-warranty-plan.md](./features/phase-3-inventory-warranty-plan.md)：Phase 3 库存、采购与质保实施计划。
- [features/phase-3-inventory-purchase-improvement-plan.md](./features/phase-3-inventory-purchase-improvement-plan.md)：Phase 3 库存采购改进实施计划。
- [features/phase-3-inventory-warranty.md](./features/phase-3-inventory-warranty.md)：Phase 3 库存、采购与质保功能说明。
- [features/phase-4-after-sales-commission-plan.md](./features/phase-4-after-sales-commission-plan.md)：Phase 4 售后、人员与提成实施计划。
- [features/phase-4-after-sales-commission.md](./features/phase-4-after-sales-commission.md)：Phase 4 售后、人员与提成功能说明。
- [features/phase-5-finance-invoice-rebate-report-plan.md](./features/phase-5-finance-invoice-rebate-report-plan.md)：Phase 5 财务、发票、返利与报表实施计划。
- [features/phase-5-finance-invoice-rebate-report.md](./features/phase-5-finance-invoice-rebate-report.md)：Phase 5 财务、发票、返利与报表功能说明。
- [features/phase-6-mini-offline-plan.md](./features/phase-6-mini-offline-plan.md)：Phase 6 微信小程序与离线实施计划。
- [features/phase-6-mini-offline.md](./features/phase-6-mini-offline.md)：Phase 6 微信小程序与离线功能说明。
- [features/phase-6-mini-program-integration-plan.md](./features/phase-6-mini-program-integration-plan.md)：Phase 6 微信小程序联调与发布实施计划。
- [features/phase-6-mini-program-acceptance.md](./features/phase-6-mini-program-acceptance.md)：Phase 6 微信小程序真机验收脚本。
- [features/phase-6-mini-program-requirements-coverage.md](./features/phase-6-mini-program-requirements-coverage.md)：Phase 6 微信小程序需求覆盖矩阵与验收记录。
- [features/phase-6-mini-program-release-checklist.md](./features/phase-6-mini-program-release-checklist.md)：Phase 6 微信小程序发布前检查清单。

### 部署与环境

- [deploy-setup.md](./deploy-setup.md)：部署配置说明。

## 推荐阅读顺序

1. [governance/ARCHITECTURE.md](./governance/ARCHITECTURE.md)
2. [governance/API_GUIDELINES.md](./governance/API_GUIDELINES.md)
3. [governance/CODE_STYLE.md](./governance/CODE_STYLE.md)
4. [governance/CONTRIBUTING.md](./governance/CONTRIBUTING.md)
5. [governance/REFACTOR_PLAN.md](./governance/REFACTOR_PLAN.md)
