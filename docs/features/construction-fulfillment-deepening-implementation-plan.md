# ConstructionFulfillment 深化实施计划

## 1. 实施基线

- PRD：`docs/features/construction-fulfillment-deepening-prd.md` v0.2
- 评审：`docs/features/construction-fulfillment-deepening-prd-review.md`，结论“可以进入研发”
- 目标 branch：当前工作分支 `codex/submit-store-use-case`
- 目标：把施工履约相关 caller 收拢到 `ConstructionFulfillment`，保持 API/DTO 兼容，并让 `OrderLifecycle.transition` 成为普通/跨店命令唯一写入 authority。

## 2. Caller inventory（G2 产物）

| Caller / 文件 | 当前依赖 | 分类 | 实施动作 |
|---|---|---|---|
| `apps/api/src/construction/construction.controller.ts` | `ConstructionFulfillment`、`ConstructionService`、`CrossStoreConstructionService` | 混合 | 履约详情、列表、普通命令、跨店任务读写全部改走 Fulfillment；容量、成本、照片、物料、排班等 route 保留专属 service |
| `apps/api/src/construction/construction-fulfillment.ts` | 两个 construction service、`OrderLifecycle`、Prisma、AccessContext | 核心 seam | 保留稳定 view/list/capability；把 command 入口改为 actor/context 归一化后直接调用 `OrderLifecycle.transition`；新增跨店详情入口 |
| `apps/api/src/construction/construction.service.ts` | `OrderLifecycle`、Prisma 等 | 非履约 implementation + 旧 command adapter | 保留照片、物料、排班、离线、assignment 等非履约能力；普通履约 command 方法不再被 controller/新 caller 使用，视实际 caller 决定是否保留兼容转发 |
| `apps/api/src/construction/cross-store-construction.service.ts` | Prisma、AccessContext | 跨店 persistence implementation | 保留任务/产品映射事实读写；任务详情由 Fulfillment 统一包装；产品映射 route 保持直接依赖 |
| `apps/api/src/construction/construction.module.ts` | provider/export | module boundary | 保持只 export `ConstructionFulfillment`、容量、成本；不重新 export 两个 implementation |
| `apps/api/src/deep-module-contracts.test.ts` | module contract、Fulfillment view/list | 架构契约 | 增加“controller 履约路径不绕过 seam”和 command result contract 测试；保留非履约 transport pass-through 断言 |
| `apps/api/src/construction/construction.service.test.ts` | ConstructionService | implementation tests | 保留非履约证据/物料行为；不把它作为新的 external seam 测试入口 |
| `apps/api/src/construction/offline-sync.test.ts` | ConstructionService | 非履约/离线 compatibility | 保持不变，验证离线同步不被误收口 |
| `apps/web/src/features/construction/api.ts` | 既有 fulfillment DTO/API | API consumer | 不改 route/DTO；完成 typecheck 和相关页面回归 |
| `apps/web/app/construction/orders/[id]/page.tsx`、`tasks/[id]/page.tsx` | fulfillment view | Web consumer | 不改业务协议；验证 `lifecycleError` 与既有 view 类型兼容 |

静态检索命令：

```powershell
rg -n "ConstructionService|CrossStoreConstructionService|ConstructionFulfillment" apps/api/src apps/web -g "*.ts" -g "*.tsx"
rg -n "\.assign\(|\.start\(|\.complete\(|\.qualityCheck\(|crossStore\.get" apps/api/src
```

## 3. 分阶段任务

### Phase 1：建立 command contract 与测试替身

目标：先固定唯一 command authority，避免实现过程中出现双路径。

任务：

1. 明确 `ConstructionFulfillment` command 方法的输入仍接收 `AuthenticatedConstructionUser` 和 route context。
2. 在 seam 内完成 actor 转换（复用 `ConstructionService.withStoreMember` 的等价规则或提取共享内部 helper），但不复制状态转换。
3. 为 `OrderLifecycle.transition` 建立可注入/可 spy 的测试替身，验证普通和跨店 command 的 command type、target order、source、版本上下文。
4. 明确成功返回现有 transition payload，拒绝沿用现有 HTTP exception/error code。

产物：command contract tests、更新后的 seam 代码骨架。

阶段门：能证明 Fulfillment 不直接写订单/施工状态，也不调用旧 command adapter 形成第二路径。

### Phase 2：收拢普通施工履约命令

范围：assign、start、complete、qualityCheck。

任务：

1. `ConstructionFulfillment.assign/start/complete/qualityCheck` 统一调用 `OrderLifecycle.transition`。
2. 保留现有 `source: "CONSTRUCTION_WEB"`，保留 commandId、expectedVersion、assigned worker 和 construction capability 校验。
3. controller 继续使用原 route/header/DTO，只改依赖入口。
4. 失败、幂等重放、版本冲突和事务回滚均由 `OrderLifecycle.transition` 处理，Fulfillment 不加外层状态写事务。

验收：普通命令 applied/replayed/rejected 三类测试通过；施工完成不改变最终交付 ownership。

### Phase 3：收拢跨店任务详情与命令

范围：任务列表、详情、accept、reject、cancel、submit-acceptance、source-accept。

任务：

1. 在 `ConstructionFulfillment` 增加/承接跨店任务详情读取，复用 `CrossStoreConstructionService` 的事实加载和现有权限裁剪。
2. controller 的 `getCrossStoreTask` 改调用 Fulfillment；产品映射 route 保持 `CrossStoreConstructionService`。
3. 跨店命令继续通过 `OrderLifecycle.transition`，传递 commandId、expectedVersion、taskVersion 和 `source: "CONSTRUCTION_WEB"`。
4. 保持 source/execution scope 能力拼装、任务状态和源门店最终接受边界。

验收：双门店权限矩阵、taskVersion 冲突、源门店未接受不完成最终交付测试通过。

### Phase 4：controller/module 收口与兼容清理

任务：

1. 通过静态检索确认施工履约 route 不再直接调用 `ConstructionService`/`CrossStoreConstructionService`。
2. 保留容量、成本、照片、材料、排班、离线和产品映射的专属 service 依赖。
3. 评估 `ConstructionService` command adapter 是否仍有非 controller caller；有则保留为临时 adapter，无则删除或降为内部 helper。
4. 保持 `ConstructionModule` 不 export 两个 implementation。
5. 更新 deep-module contract，加入 deletion test：移除 controller 直接 implementation 依赖后，履约规则不扩散。

验收：caller inventory 所有项有分类和处理结果；无新绕行 caller。

### Phase 5：文档、全量验证与交付

任务：

1. 更新 `CONTEXT.md`：记录 ConstructionFulfillment ownership、排除项、command authority 和失败语义。
2. 若 ADR-0006/0011 需要补充实现落点，只做增量说明，不改变 accepted decision。
3. 运行 Prisma validate、API/Web typecheck、API/Web 全量测试、`git diff --check`。
4. 生成实施验证摘要，提交并推送当前 branch。

## 4. 预计修改文件

### 必改

- `apps/api/src/construction/construction-fulfillment.ts`
- `apps/api/src/construction/construction.controller.ts`
- `apps/api/src/deep-module-contracts.test.ts`
- `docs/features/construction-fulfillment-deepening-prd.md`
- `docs/features/construction-fulfillment-deepening-prd-review.md`
- `CONTEXT.md`（实施完成后）

### 视 caller inventory 决定

- `apps/api/src/construction/construction.service.ts`
- `apps/api/src/construction/cross-store-construction.service.ts`
- `apps/api/src/construction/construction.module.ts`
- `apps/api/src/construction/construction.service.test.ts`
- `apps/api/src/construction/offline-sync.test.ts`

### 明确不改

- `apps/web/src/features/construction/api.ts` 的 route/DTO 契约
- `apps/web/app/construction/orders/[id]/page.tsx`
- `apps/web/app/construction/tasks/[id]/page.tsx`
- `apps/api/src/orders/domain/order-lifecycle.ts` 的最终交付 ownership 和既有 command transaction semantics
- Prisma schema / migration（本期不新增持久化字段）

## 5. 测试矩阵

| 场景 | 类型 | 预期 |
|---|---|---|
| 普通命令正确版本成功 | contract/integration | applied，施工事实和版本原子变化 |
| 普通命令同 commandId 重试 | contract | replayed，返回原 payload，无重复写入 |
| 普通命令版本冲突 | integration | rejected/冲突，无部分写入 |
| 普通命令 capability 不满足 | contract | 稳定错误，无状态变化 |
| 跨店命令正确 taskVersion | contract/integration | applied，任务与订单生命周期一致 |
| 跨店 taskVersion 冲突 | integration | rejected，不覆盖并发更新 |
| source/execution 权限矩阵 | contract | 只允许对应 scope，敏感字段裁剪 |
| lifecycle 详情读取失败 | contract | 详情失败关闭 |
| lifecycle 列表读取失败 | contract | 保留事实并返回 `lifecycleError` |
| 非履约照片/物料/离线 | regression | 既有 service 行为不变 |
| controller 依赖收口 | static/contract | 履约 route 无直接 implementation call |
| API/Web compatibility | typecheck/full test | 既有 route/DTO/Web caller 不回归 |

## 6. 回滚策略

- 每个 phase 独立提交，优先保持 route 和 DTO 不变。
- 若普通 command contract 失败，回滚 Fulfillment command implementation，不改变 `OrderLifecycle` 核心事务。
- 若跨店详情裁剪回归，保留原 `CrossStoreConstructionService.get` 作为临时 adapter，但禁止新增直接 controller caller，并记录后续修复项。
- 若非履约 service 回归，恢复其内部调用保留，不恢复 controller 对履约命令的绕行。
- 不执行破坏性数据迁移，本期回滚无需数据库恢复。

## 7. 完成定义

- [ ] G1：PRD v0.2 评审通过。
- [ ] G2：caller inventory 完成并归类。
- [ ] G3：普通/跨店 command 全部通过 `OrderLifecycle.transition`。
- [ ] G4：controller 履约 route 无直接 implementation 依赖。
- [ ] G5：contract/integration/regression/typecheck/full test 全通过。
- [ ] CONTEXT/ADR/验证摘要同步。
- [ ] commit、push 和 remote 状态可核验。
