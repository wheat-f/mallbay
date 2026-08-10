# Bootstrap a single headquarters administrator

总部权限本轮采用单一初始化账号承载：权限迁移脚本按环境显式配置的 `HQ_ADMIN_USERNAME`（本地统一为 `xiaoming`，测试库和生产为 `zhouluoren`）幂等创建或补齐一个 `HQ_ADMIN/HQ` 绑定，创建新用户时从 `HQ_ADMIN_PASSWORD` 读取初始密码；不再根据所有 `isAuditor=true` 用户自动创建总部绑定，也暂不开放总部管理员通过页面修改、创建或绑定其他人员。这样可以让总部治理入口有确定的责任主体，避免旧审核员标记意外扩大总部权限，同时保留该账号已有的门店角色绑定。

## Status

accepted

## Consequences

- `isAuditor` 不再是新的总部授权来源，遗留代码必须逐步迁移到有效的 `HQ_ADMIN/HQ` 权限判断。
- `HQ_ADMIN_USERNAME` 必须由每个环境显式配置；部署配置/发布预检负责校验本地为 `xiaoming`、测试库和生产为 `zhouluoren`，迁移脚本只校验非空并原样使用，不使用隐式默认账号。
- 迁移脚本必须可重复执行，不重复创建用户、角色或绑定，也不能覆盖目标账号密码和既有门店成员关系；发现其他有效总部绑定时必须失败并保持数据不变。
- 总部成员绑定能力暂时只能由迁移脚本完成；页面和公开写接口必须拒绝新增、修改或停用其他人员的总部绑定。
