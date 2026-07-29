# 系统设置职责工作台验收证据（2026-07-29）

## 最终状态摘要（以本节及文档末尾最新记录为准）

- `settings.permissions` 全局 v1 已正式发布；`Permissions` 和 `FinanceSettlement` 迁移确认项均已 `RESOLVED`。
- 每个本地门店已生成 `finance.settlement` v1 并保持幂等；策略缺失时真实成本运行拒绝隐式默认。
- 审计权限最终边界：总部审计员全局、店长本店业务、财务本店财务域；施工和采购 403，财务跨域参数 403。
- 早期记录中的“待确认”或“所有门店成员可访问审计”均为过程状态，已被后续最终记录覆盖。
## 本期已实现

- 职责工作台按服务端 capability 返回总部治理、门店运营、财务结算、个人账号四类入口；规划中能力不可点击。
- 后端统一校验角色、操作和门店范围；店长/财务不能读取或写入其他门店，总部管理员可跨门店只读但不能代维护。
- 设置首页提供服务端摘要：版本、更新时间、待发布数量、校验失败数量，并展示最近访问和最近变更。
- 配置版本支持独立保存草稿、服务端校验、校验失败、发布、克隆、过期；已发布版本不可直接修改，生效时间重叠时拒绝发布。
- Web 所有非 GET 写请求自动携带 X-Request-Id；配置创建按 requestId 幂等；草稿更新、校验、发布与审计写入使用事务。
- 配置和字典读取提供进程内 5 分钟缓存，写入、发布、启停和导入后主动失效；配置列表返回 ETag 并支持条件请求，写接口响应敏感字段脱敏。
- 草稿满 23 天发送到期前 7 天通知，满 30 天标记过期并写审计；通知和提醒审计避免重复创建。
- 字典支持大类/小类、来源继承、编码冲突、引用保护、启停、门店自定义项和新增型 CSV/JSON/Excel 导入；导入服务端整批事务回滚；总部禁用项不可恢复，停用必须填写原因。
- 全局/财务审计支持角色范围、分页、导出上限、分页全量导出和敏感字段脱敏。
- 连续密码失败按已发布安全策略计数，达到阈值锁定账号并写认证审计；refresh token 同时遵守会话闲置超时；新增数据库字段和迁移。
- 总部管理员进入门店/财务入口时展示跨门店只读版本清单。
- 权限矩阵支持独立保存草稿与校验发布；修复财务页面角色/门店切换时的 Hooks 顺序风险。
- 认证令牌绑定独立设备会话；个人中心可查看有效设备、最近活动和脱敏 IP，并撤销非当前会话。

## 验证结果

- `pnpm --filter @mallbay/api prisma:generate`：通过。
- `pnpm --filter @mallbay/api build`：通过。
- `pnpm --filter @mallbay/web build`：通过（70 个静态页面生成）。
- API 设置权限、配置版本、认证测试：16/16 通过；本轮定向认证/设置回归：12/12 通过。
- Web 设置工作台专项测试：9/9 通过。
- `pnpm exec tsc -p tsconfig.json --noEmit --pretty false`（apps/web）：通过。
- API 直接 TypeScript 类型检查：通过；API 生产构建：通过；新增 AuthSession Prisma 客户端生成与 schema validate：通过。
- 三角色权限契约测试：8/8 通过；字典危险操作契约测试：2/2 通过；Web 生产构建：70/70 页面生成（页面修复后复验）。
- Web 全量 node:test：603/604 通过；唯一失败是既有跨店施工菜单期望与当前跨店施工入口不一致，不属于本次设置工作台改动。
- 新增 `pnpm --filter @mallbay/api settings:migrate` 幂等旧字典迁移脚本，并完成脚本静态类型检查；API 全量测试因现有数据库依赖测试在无 PostgreSQL 环境下超时，已用定向单元/契约测试完成代码级回归。该条为早期记录，已由本文件“2026-07-29 续验与修复”章节中的真实数据库、迁移和运行态结果 supersede。

## 仍需发布前处理

1. 已修复审计页缺少 Suspense 边界导致的生产预渲染失败，Web 生产构建已通过。
2. 修复全量回归中既有的跨店施工菜单测试，或确认该测试对应的独立功能变更后同步期望值。
3. 执行真实数据库迁移、三角色运行时验收和历史订单配置快照回归。
4. MFA、IP 白名单和异常风险识别属于 PRD 明确的二期事项，不作为本期验收阻塞项。
## 2026-07-29 续验与修复

- Docker/PostgreSQL 已恢复：`mallbay-postgres-1` 为 running，5432 可连接，`pg_isready` 返回 accepting connections；PostgreSQL 完成异常关机后的 WAL 自动恢复，未删除持久化卷。
- 真实数据库校验：52 个 Prisma migration 已全部应用，数据库不变量预检通过；旧字典迁移首次 `created:43, skipped:0`，重复执行 `created:0, skipped:43`。
- API 运行态：真实总部管理员登录成功；`/settings/capabilities` 返回 13 项能力，`/settings/summary` 返回 13 张卡片；条件请求返回 304；跨端口 CORS 预检返回 204 并允许 `X-Request-Id`；跨职责写入返回 403。
- 服务端规则：非法安全配置直接发布返回 409；同一创建 requestId 重试返回同一配置版本；审计支持 page/pageSize、组合筛选、列表/导出脱敏和导出行为审计；字典启停携带版本号；配置撤回要求原因并写审计；安全策略必须明确生效时间；草稿支持 7 天和 1 天到期提醒。
- 本轮修复：API CORS 增加 `X-Request-Id`/`If-None-Match`；配置发布服务端二次校验；递归敏感字段脱敏；审计导出审计；字典危险操作二次确认；“查看全部设置”改为能力驱动清单。
- 最新验证：API/Web 类型检查通过，API 关键契约测试 10/10，通过 Web 设置专项测试 9/9，Web 生产构建 70/70 页面生成成功。

## 当前已知边界

- MFA、IP 白名单、设备风险识别按 PRD 明确列为二期。
- 店长和财务真实密码未在本地验收环境提供，因此本轮没有修改账号或伪造令牌；角色差异由服务端策略测试覆盖，真实总部管理员链路已验证。
## 2026-07-29 总部模板与分页续验

- 新增 Prisma 模型 `DictionaryTemplate` / `DictionaryTemplateItem`，总部模板使用全局唯一编码，不绑定门店；迁移 `20260729140000_dictionary_hq_templates` 已应用。
- 总部模板提供服务端创建、编辑、增项、逐项启停和版本校验；非总部账号维护接口返回 403。门店读取时合并活动模板并标记 `source=HQ_TEMPLATE`、`readOnly=true`；门店自定义项与活动总部模板同编码时服务端拒绝。
- 真实运行态（加密登录 `xiaoming`）：`/health` 返回 `ok`；创建总部模板返回 `source=HQ_TEMPLATE`；模板列表数量为 1；统一字典读取发现继承模板数量为 1。
- 配置版本列表已统一支持 `page/pageSize`，默认 1/20，最大 100，返回 `rows/total/page/pageSize`；所有设置编辑页已适配。
- 最新验证：API/Web 类型检查通过；API 设置/认证测试 12/12 通过；Web 设置测试 9/9 通过；API 与 Web 生产构建通过；Prisma 报告 53 个迁移且数据库 schema up to date。
- 门店高风险开关的服务端校验要求 `disableReason`；通知/OSS 增加 `POST /settings/oss/test-connection`，服务端执行带 5 秒超时的 HEAD 探测，成功/失败均写入审计且不记录密钥。
- 新增 `/settings/account` 到个人资料重定向入口；前端生产构建共生成 71 个静态页面。
- 最终定向回归：API 13/13、Web 9/9；健康检查、加密登录、分页配置读取、总部模板读取均成功；数据库 53 个迁移已全部应用。
- 配置校验、发布、撤回接口现在读取 `X-Request-Id`；发布/撤回重复请求可返回原状态，避免重复审计。
- 字典删除接口要求服务端原因；引用保护、版本冲突、编码冲突和停用失败均保留失败审计元数据。
- 本轮补齐未保存离开保护：站内链接、浏览器回退和刷新均拦截，提供“保存草稿 / 放弃 / 取消”；保存/发布成功后清理保护历史项。Web TypeScript 检查通过，Web 设置专项测试 9/9，生产构建 71/71 页面生成成功。
- 迁移控制增强：新增 `SettingsMigrationRun` 与 `SettingsMigrationReview`；迁移脚本默认要求 `pg_dump` 备份，只有显式 `--skip-backup` 才跳过；本地幂等演练 `created:0, skipped:43`，回滚 dry-run 识别 43 个候选版本且未执行删除；总部加密登录后访问 `/settings/migration-reviews` 返回空的 PENDING 清单（运行态 health=ok）。
- 迁移脚本参数验收：未提供备份文件且未显式跳过时会在数据库写入前失败；使用 `--skip-backup` 的独立 runKey 演练返回 `created:0, skipped:43`，证明幂等和显式跳过边界。
- 迁移控制后最终回归：API 设置/认证专项 13/13；Prisma 54 个迁移且 database schema up to date；API 类型检查/构建通过。
- 直链授权补齐：权限、字典、审计和通用配置编辑器统一读取服务端能力并渲染 403；新增守卫回归后 Web 设置专项测试 10/10，Web 生产构建 71/71 页面成功生成。
- 字典大类停用补齐服务端原因校验与失败审计；契约测试 4/4，API/Web 生产构建通过，最新 API 重启后 `/health` 返回 `ok`。
- 历史域迁移已实际落地：`settings:migrate:domains --skip-backup` 首次生成 5 个确定归属配置版本（2 门店资料、可识别容量、收款账户、岗位小时成本），创建 2 条人工确认记录（代码策略权限、缺失历史结算规则）；重复执行幂等复用；回滚 dry-run 识别 5 个候选版本。
- 历史域迁移后最终定向回归：API 14/14、Web 设置 10/10，API/Web 构建通过；迁移数据库状态保持 schema up to date。
- 人工确认闭环新增：总部审计可通过 `PATCH /settings/migration-reviews/:id` 以原因确认或忽略，服务端事务更新状态并写审计；服务层测试 1/1。真实加密登录读取 PENDING 队列返回 2 项，来源为 `Permissions` 与 `FinanceSettlement`，未擅自处理。
- 人工确认闭环后最终专项回归：API 15/15、Web 设置 10/10；API/Web 生产构建成功，运行态 health=ok。
- 灰度回滚入口落地：`NEXT_PUBLIC_SETTINGS_WORKBENCH_MODE=legacy` 时 `/settings` 重定向到 `/settings/legacy` 兼容只读页；只读页不提供写入/发布/启停操作。新增回归通过，Web 设置测试 11/11，生产构建 72/72 页面生成。
### 2026-07-29 本地真实角色运行态核验（账号凭据由用户提供）

- 四个本地开发角色均通过加密登录成功：店长 `dianzhang`、施工 `shigong`、财务 `caiwu`、采购 `caigou`；未记录密码、访问令牌或响应敏感字段。
- 能力集合核验：店长 `store.profile`、`store.operations`、`store.notifications`、`store.capacity`、`account.profile`；施工与采购仅 `account.profile`；财务 `finance.labor_cost`、`finance.settlement`、`finance.accounts`、`finance.audit`、`account.profile`。
- 只读接口边界核验：店长门店配置 200、财务配置 403、HQ 权限配置 403；财务财务配置 200、门店配置 403、HQ 权限配置 403；施工和采购的门店/财务/HQ 配置均 403。
- 跨门店范围核验：四个角色请求其他门店 scope 均返回 403。
- 审计列表按当前实现对已归属门店的成员开放；财务角色默认限定财务域，HQ 审计由审计员使用。

### 2026-07-29 业务确认与补充落地

- 成本核算追溯确认：旧系统已有岗位小时成本版本（`PositionCostRateVersion`/`PositionCostRate`）、订单材料/施工成本试算、完工成本结算（`ConstructionCostSettlement`）、施工人员提成快照、成本调整单及结算后冻结逻辑；这些逻辑继续作为真实核算链路，不重复造数。
- `FinanceSettlement` 复核结论：历史库没有独立的可配置成本/结算口径模型，现有成本核算逻辑主要由订单价格快照、岗位费率、材料实际成本、提成和结算状态共同驱动。因此未伪造默认财务结算规则，确认项继续保留为待业务定义的配置口径。
- 总部权限矩阵已按确认的角色种子矩阵更新、服务端校验并正式发布：`settings.permissions` / `global` / v1，状态 `PUBLISHED`，校验错误为空；对应 `Permissions` 迁移确认项已标记 `RESOLVED` 并写入审计。
- 审计越权修复：设置审计仅允许总部审计员、店长和财务访问；施工与采购访问返回 403。隔离端口运行态复核：店长 200、财务 200、施工 403、采购 403。
- 审计域参数越权补充修复：财务显式请求 `domain=STORE` 返回 403，默认请求仍仅返回财务域；店长请求 `domain=FINANCE` 返回 403；施工、采购无论是否带域均返回 403。最新隔离端口运行态验证结果：店长默认 200 / 财务域 403，财务默认 200 / 门店域 403，施工 403，采购 403。
- 审计授权回归测试通过 1/1，API typecheck 通过，API 生产构建通过。

### 2026-07-29 FinanceSettlement 方案落地

- 新增 `finance.settlement` 策略 payload 与服务端校验：实际入库价优先、标准材料成本兜底、缺失成本禁止确认、提成取财务最终值、`SETTLED` 后冻结、成本调整仅财务审批。
- 成本试算已读取门店已发布策略：策略关闭实际入库价优先时不读取库存批次优先值，关闭标准成本兜底时不使用产品标准成本；默认 v1 保持原有行为。
- 完工成本结算已读取门店策略；实际成本缺失仍禁止确认，不允许静默按零成本结算。
- 新增 `settings:migrate:finance-settlement`，为本地 2 个门店生成 `finance.settlement` v1 已发布版本；首次迁移 `created:2, skipped:0`，重复执行 `created:0, skipped:2`。
- 真实运行态验证：财务角色读取本门店策略返回 `PUBLISHED v1`，策略字段完整；API health=ok。
- `FinanceSettlement` 迁移确认项已标记 `RESOLVED`，原因和策略发布审计已记录。
- API FinanceSettlement/成本结算专项测试 16/16，API typecheck/build 通过；Web typecheck/build 通过，72/72 页面生成。
