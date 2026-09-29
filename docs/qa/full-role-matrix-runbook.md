# Test 环境全角色权限矩阵验收

## 凭据与入口

- 本机仅使用 `.codex/permission-regression-test-accounts.txt`。八个主账号沿用现有段名；总部账号新增 `[hq-admin]`，字段为 `position=HQ_ADMIN`、`username=<测试环境实际账号>`、`password=<实际密码>`。该文件和 `.codex/verification/` 已在 `.gitignore` 中精确忽略；不得提交、打印或上传原始凭据。
- 店长邀请／移除后的旧会话失效需要另一个**当前未加入任何门店**的专用账号，可在同一文件增加 `[aux-member]`，字段 `position=SALES`、`username=<辅助测试账号>`、`password=<实际密码>`。执行器不创建新账号；缺少该账号时本项为 `BLOCKED`。
- CI 使用 `test` environment 的 `MALLBAY_ROLE_MATRIX_ACCOUNTS` Secret，其值为同一 INI 格式的完整文件内容。仅通过 `MallBay Test Full Role Matrix` 的手动 `workflow_dispatch` 运行；普通 Test 部署只进行不带凭据的登录页冒烟。
- 执行器拒绝把凭据发送到 `http://8.136.156.153:3000` / `http://8.136.156.153:3001` 以外的地址。没有 Test 环境凭据时不得借用浏览器保存的密码或生产账号。

## 写入门禁与收尾

- 默认只读。只有确认 Test 中真实支付、短信、邮件及外部通知通道关闭，且手动输入 `enable_mutations=true` 与 `external_channels_disabled=true`，才会执行已实现的客户、产品可逆写入场景。
- 每条测试记录使用 `REGRESSION-YYYYMMDD-HHmmss-角色-随机标识`。执行器以 `finally` 归档客户、停用产品，并复查最终状态；清理失败不是通过。不要对真实历史业务做物理删除。
- `second_store_id`、`second_store_customer_id`、`second_store_product_id` 可手动提供；总部账号也会只读盘点 `/stores/admin/all`，并尝试从已发布的第二 Test 门店自动找到客户和产品。无论来源如何，资源都需由总部详情接口核实属于该门店后，才用于跨店断言。当前执行器**不自动创建**第二门店或辅助成员，以免在未知通知／账号状态下产生不可控夹具。
- 总部策略版本发布还需手动确认 `policy_exclusive_window=true`，并由新只读接口 `/permissions/policy/draft` 证实没有现存草稿；否则为 `BLOCKED`。执行器仅发布与原内容相同的测试版本，发布命令携带 `expectedPublishedId` 进行并发基线校验，用旧会话第一条请求核对新 `policyVersion`，随后回滚并核对授权内容与版本。发布前失败而留下候选版本、并发改变基线或回滚失败均为 `FAIL`，不得清除他人草稿。

## 当前覆盖边界

- 已实现：八角色独立浏览器上下文的登录／刷新／退出、菜单与快捷入口采集、19 个业务域的版本化页面／API 读取预期、通用角色绑定写 API 403、角色绑定只读诊断、跨门店列表及具体资源 403、客户和产品安全可逆操作、客户 OWN 异主读取和清理核对，以及具备专用辅助账号时的店长邀请／移除与旧会话失效。总部无法核实第二门店具体资源时，该项为 `BLOCKED`。
- 未实现的有权写入场景（订单、报价、施工、库存、采购、财务、发票、返利、提成、售后、质保、退货、人员、门店、权限、审计、设置）均输出 `BLOCKED`。该清单未清空前，整轮报告不可能是 `PASS`。
- 报告写入 `.codex/verification/full-role-matrix-<timestamp>.json`，关键截图在同名目录。`FAIL` 优先于 `BLOCKED`；任何必测单元缺失、浏览器 RPC／Playwright 不可用、截图或清理失败均不能伪报通过。现有会改写账号密码、物理删除夹具的订单 E2E 脚本不作为此矩阵的实现或通过依据。
