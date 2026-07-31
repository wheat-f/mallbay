# MallBay 文档规范

本文档定义 MallBay 文档的目录、命名、内容和维护规则。所有新增文档 MUST 遵守本规范。

## 文档目录规范

MUST：

- 项目文档统一放在 `docs/` 下，仓库根目录只保留 `README.md` 作为项目入口。
- 治理类文档放在 `docs/governance/`。
- 部署、运维、环境配置类文档优先放在 `docs/deployment/`；当前 `docs/deploy-setup.md` 暂时保留，后续可独立迁移。
- 新增目录前必须确认现有目录不能表达该文档类型。

当前目录职责：

```text
docs/
  README.md                       文档索引
  current-system-overview.md     当前代码、流程、环境和验证基线
  DOCUMENTATION_GUIDELINES.md     文档规范
  deploy-setup.md                 当前部署配置说明
  governance/                     工程治理、架构和协作规范
  features/                       业务功能方案、实施计划和验收说明
```

RECOMMENDED 预留目录：

```text
docs/decisions/   架构决策记录，使用 ADR 格式
docs/deployment/  部署、发布、环境和回滚文档
docs/features/    业务功能说明和验收规则
docs/runbooks/    故障处理、巡检和运维手册
```

## 命名规范

MUST：

- 文档文件使用大写下划线或小写短横线，目录内保持一致。
- 治理类稳定文档使用大写下划线，例如 `API_GUIDELINES.md`。
- 操作手册、部署说明、临时说明使用小写短横线，例如 `deploy-setup.md`。
- 文件名必须表达文档主题，禁止使用 `doc.md`、`note.md`、`new.md`。

RECOMMENDED：

- ADR 使用 `YYYY-MM-DD-short-title.md`。
- Runbook 使用 `<system>-<operation>-runbook.md`。
- 功能建设方案使用 `<feature>-system-plan.md` 或 `<feature>-plan.md`。
- 功能实施计划使用 `<phase-or-feature>-implementation-plan.md`；如果已有同类文件使用短名，可沿用 `<phase-or-feature>-plan.md`，但文档标题必须明确“实施计划”。

## 文档内容规范

MUST：

- 开头用一级标题说明文档主题。
- 一级标题下方必须说明文档类型、状态、适用范围和来源依据。
- 明确标注规则强度：`MUST`、`MUST NOT`、`RECOMMENDED`。
- 对规范类文档给出推荐和禁止示例。
- 涉及当前项目现状时，必须指向真实目录、模块或文件。
- 涉及改造计划时，必须说明优先级、风险和回滚原则。
- 实施计划必须拆分为可提交、可验证、可回滚的任务，并给出验证命令或验收路径。

MUST NOT：

- 写与当前项目无关的教科书式规范。
- 在文档中承诺尚未存在的能力为“已完成”。
- 用文档替代必要的测试、约束或代码校验。

功能方案和实施计划 MUST 区分：

- 功能方案说明“为什么做、做什么、边界是什么”，放在 `docs/features/`。
- 实施计划说明“按什么顺序改、改哪些文件、如何验证和回滚”，放在 `docs/features/`。
- 已交付功能说明必须避免写成未来计划，文件名不应包含 `plan`。

## 链接规范

MUST：

- 文档之间使用相对链接。
- 移动文档时同步更新 `README.md` 和 `docs/README.md`。
- 链接目标必须存在。

推荐：

```md
[API 规范](./governance/API_GUIDELINES.md)
```

禁止：

```md
[API 规范](./governance/API_GUIDELINES.md)
```

## 维护规范

MUST：

- 架构、API、编码规范变更必须同时更新相关治理文档。
- 文档结构调整必须更新本文档。
- PR 中如果改变开发流程、目录结构或 API 契约，必须说明是否已更新文档。

RECOMMENDED：

- 文档和代码行为变更分开提交。
- 大型规范变更先提交 docs-only PR。

## 评审清单

提交文档变更前 MUST 检查：

- 文档是否放在正确目录。
- 文件名是否符合命名规范。
- `README.md` 和 `docs/README.md` 是否需要更新。
- 链接是否仍然有效。
- 是否清楚区分 `MUST`、`MUST NOT`、`RECOMMENDED`。
- 是否包含与 MallBay 当前代码库相关的具体内容。
