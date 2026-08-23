# MemberInvitationWorkflow｜实施计划

## 1. 实施目标

把邀请创建、接受、拒绝、取消旧邀请、移除成员、成员迁移和通知意图收拢到 workflow interface；保持 `StoreGovernance` 拥有门店/经理生命周期。

## 2. 实施顺序

1. **建立 contract test**：覆盖岗位限制、重复邀请、邀请接收人校验、并发接受、冻结成员迁移、经理保护、移除审计和通知失败。
2. **确认通知投递对象**：复用现有 notification 记录或新增专用投递记录，必须有唯一键、状态、重试次数、最近错误和关闭时间。
3. **建立 workflow seam**：将成员状态、邀请状态和唯一性规则收拢到 `MemberInvitationWorkflow` module；访问主体和 StoreGovernance 结果作为内部 adapter。
4. **统一业务事务**：接受邀请时成员迁移、关系创建、邀请状态变更和通知意图同事务完成；通知发送在提交后执行。
5. **迁移 controller**：保持现有输入输出和错误协议，controller 单向调用新 workflow interface。
6. **删除旧路径**：静态搜索邀请/成员关系写入，确认没有其他权威路径后删除旧实现暴露。

## 3. 预计文件范围

- `apps/api/src/members/members.service.ts`
- `apps/api/src/members/members.controller.ts`
- `apps/api/src/members/members.module.ts`
- `apps/api/src/notifications/*`（仅按现有能力选择投递记录复用或补充 adapter）
- `apps/api/src/members/*contract*.test.ts`

## 4. 关键实现约束

- 不新增邀请过期状态；保持 `PENDING/ACCEPTED/REJECTED/CANCELLED`。
- 同门店同用户最多一个有效成员关系和一个有效待处理邀请。
- 普通邀请不能产生或移除 `MANAGER`。
- 通知失败不回滚已提交成员事实；通知 adapter 负责幂等重试。

## 5. 验证与回滚

- 使用并发测试验证接受邀请只有一个成功事务。
- 验证通知失败后业务事实保持、投递记录可重试且不重复发送。
- 静态搜索 `StoreInvitation`、`StoreMember` 写入调用方，确认 ownership 唯一。
- 失败时回滚 controller 兼容 adapter，不恢复旧的散落写入路径。
