# MallBay PlantUML Diagrams

本目录保存 MallBay 项目的 PlantUML 源文件，用于架构沟通、需求评审和代码变更说明。业务流程图以当前代码和 [current-system-overview.md](../current-system-overview.md) 为准。

## 图清单

- `system-context.puml`：系统上下文图，描述门店角色、Web、API、数据库和外部服务关系。
- `runtime-architecture.puml`：运行和模块架构图，描述 Nx monorepo、Next.js、NestJS、Prisma、PostgreSQL、Redis 的依赖。
- `core-domain-er.puml`：核心领域实体关系图，覆盖门店、客户、订单、施工、库存、采购、质保、售后和财务。
- `purchase-receiving-sequence.puml`：采购到货验收时序图，覆盖仓库选项拉取、验收入库、拒收和库存流水落库。
- `end-to-end-business-flow.puml`：系统完整业务流程图，按角色泳道串联门店开通、客户订单、库存采购、施工、质保售后、财务报表。

## 渲染示例

```bash
plantuml docs/diagrams/*.puml
```

也可以用 VS Code / IntelliJ 的 PlantUML 插件直接预览。
