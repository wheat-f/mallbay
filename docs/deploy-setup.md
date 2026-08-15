# 部署指南

## 整体流程

当前 `.github/workflows/deploy.yml` 的触发规则：

```
Pull Request（任意目标分支）
  → Verify Store Flow（API 测试、流程测试、Web 测试、类型检查、生产构建）

push main 或 push codex/**
  → Verify Store Flow
  → 构建并推送 API 镜像
  → 构建并推送 Web 测试镜像（非 main）
  → 部署 Test（非 main）

push main
  → 构建并推送 Web Production 镜像
  → 部署 Production
```

`workflow_dispatch` 可手动触发工作流。Test/Production 的部署条件和 Secrets 以 `.github/workflows/deploy.yml` 为准，不再以旧的 `test` 分支说明为准。

同一套 `docker-compose.prod.yml` 同时服务两个环境，差异完全通过各自 ECS 上的 `.env` 文件承载。

---

## 一、阿里云 ACR 准备

1. 开通**容器镜像服务**（个人版免费，企业版按量）
2. 创建命名空间，例如 `mallbay`
3. 在命名空间下创建两个仓库：`mallbay-api`、`mallbay-web`（私有）
4. 记录：
   - Registry 地址：`registry.cn-<region>.aliyuncs.com`
   - 登录用户名（主账号：手机号；子账号：`<主账号>@<子账号>`）
   - 登录密码（开通 ACR 时设置的固定密码）

---

## 二、GitHub Secrets & Environments 配置

Secrets 分两层：

- **仓库级 Secrets**：两套环境共用（ACR 凭证）
- **Environment Secrets**：每个环境独立（ECS 连接信息）

### 2.1 仓库级 Secrets

**GitHub → 仓库 → Settings → Secrets and variables → Actions → New repository secret**

| Secret 名称      | 说明            | 示例                                  |
| --------------- | -------------- | ------------------------------------- |
| `ACR_REGISTRY`  | ACR 域名        | `registry.cn-hangzhou.aliyuncs.com`  |
| `ACR_NAMESPACE` | ACR 命名空间     | `mallbay`                            |
| `ACR_USERNAME`  | ACR 登录用户名   | `your-aliyun-account`                |
| `ACR_PASSWORD`  | ACR 登录密码     | `your-acr-password`                  |

### 2.2 创建 GitHub Environments

**GitHub → 仓库 → Settings → Environments → New environment**

#### Environment: `test`

- 不设 Protection rules（push test 分支即自动部署）
- 添加以下 Secrets：

| Secret 名称    | 说明             | 示例              |
| ------------- | --------------- | ----------------- |
| `ECS_HOST`    | Test ECS 公网IP  | `47.xxx.xxx.100`  |
| `ECS_USER`    | SSH 用户名        | `root`            |
| `ECS_SSH_KEY` | SSH 私钥          | `-----BEGIN...`   |

#### Environment: `production`

- 不设 Protection rules（push / 合并 main 分支即自动部署）
- 添加以下 Secrets（值不同于 test）：

| Secret 名称    | 说明                  | 示例              |
| ------------- | -------------------- | ----------------- |
| `ECS_HOST`    | Production ECS 公网IP | `47.xxx.xxx.200`  |
| `ECS_USER`    | SSH 用户名             | `root`            |
| `ECS_SSH_KEY` | SSH 私钥              | `-----BEGIN...`   |

> 两台 ECS 可以用同一套 SSH Key，也可以各自独立，取决于你的安全策略。

---

## 三、两台 ECS 初始化（分别执行）

### 1. 安装 Docker & Docker Compose

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
```

### 2. 配置 ACR 登录（持久化）

```bash
docker login registry.cn-<region>.aliyuncs.com \
  -u <ACR_USERNAME> \
  -p <ACR_PASSWORD>
```

### 3. 创建项目目录

```bash
mkdir -p /opt/mallbay
```

### 4. 写入各自的 `.env`

**Test ECS** `/opt/mallbay/.env`：
```bash
# 数据库
DATABASE_URL=postgresql://postgres:STAGING_PWD@postgres:5432/mallbay?schema=public
POSTGRES_USER=postgres
POSTGRES_PASSWORD=STAGING_PWD
POSTGRES_DB=mallbay

# Redis
REDIS_URL=redis://redis:6379

# JWT（openssl rand -hex 32）
JWT_ACCESS_SECRET=test-access-secret-xxxx
JWT_REFRESH_SECRET=test-refresh-secret-xxxx
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
METRICS_TOKEN=replace-with-a-random-internal-scrape-token
AUTH_CREDENTIAL_ENCRYPTION_ENABLED=false

# 域名
WEB_ORIGIN=https://test.yourdomain.com
NEXT_PUBLIC_API_URL=https://api-test.yourdomain.com
NEXT_PUBLIC_AUTH_CREDENTIAL_ENCRYPTION_ENABLED=false

# OSS（测试环境可用独立 bucket 隔离数据）
OSS_REGION=oss-cn-hangzhou
OSS_ACCESS_KEY_ID=xxxx
OSS_ACCESS_KEY_SECRET=xxxx
OSS_BUCKET=mallbay-test

# ACR
ACR_REGISTRY=registry.cn-hangzhou.aliyuncs.com
ACR_NAMESPACE=mallbay
IMAGE_TAG=latest
```

**Production ECS** `/opt/mallbay/.env`（同结构，换成生产值）：
```bash
DATABASE_URL=postgresql://postgres:PROD_STRONG_PWD@postgres:5432/mallbay?schema=public
POSTGRES_PASSWORD=PROD_STRONG_PWD
WEB_ORIGIN=https://yourdomain.com
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
AUTH_CREDENTIAL_ENCRYPTION_ENABLED=true
METRICS_TOKEN=replace-with-a-random-internal-scrape-token
NEXT_PUBLIC_AUTH_CREDENTIAL_ENCRYPTION_ENABLED=true
OSS_BUCKET=mallbay-prod
# ... 其余同上，值换成生产配置
```

### 6. 内部指标抓取

API 提供受保护的 `GET /internal/metrics` 快照接口，仅供预发/运维监控使用。请求必须携带 `X-Metrics-Token`，其值与 ECS `.env` 中的 `METRICS_TOKEN` 完全一致；未配置或令牌不匹配时返回 404，不向业务页面或浏览器公开。快照包含订单履约命令计数、重放/回滚计数和有界 P50/P95/P99 耗时样本。

订单履约 API 启动后会运行 `OrderLifecycleReconciliationService`：默认每 5 分钟扫描历史履约不变量，并在发现终态质量、质保、版本账本或历史事实不一致时，以数据库 advisory lock 保护、幂等地创建或合并 OPEN 验证案例。该任务只登记待核查事实，不自动修改订单、施工或财务事实；扫描失败会记录 `order_lifecycle_reconciliation_failures_total`，应触发预发/生产告警。运维应同时关注 `order_lifecycle_reconciliation_violations_total`、`order_lifecycle_reconciliation_cases_created_total` 和 `order_lifecycle_reconciliation_cases_updated_total`，并通过订单详情的历史核查入口完成人工处置。

### 5. 首次启动数据库（先于 API 启动）

```bash
cd /opt/mallbay

# 手动复制 compose 文件（之后 CI/CD 会自动同步）
# scp docker-compose.prod.yml root@<ECS_IP>:/opt/mallbay/

# 先拉起数据库（API 启动时会先跑数据库不变量预检，再执行 prisma migrate deploy）
docker compose -f docker-compose.prod.yml up -d postgres redis

# 等待 postgres 健康后再启动 api/web
sleep 10
docker compose -f docker-compose.prod.yml up -d api web

# 查看日志
docker compose -f docker-compose.prod.yml logs -f api
```

---

## 四、日常发布流程

```bash
# 1. 开发完成，推到 test 分支 → 自动部署 Test
git push origin codex/<branch>

# 2. 在 Test 验收通过后，合并到 main → 自动部署 Production
git checkout main
git merge codex/<branch>
git push origin main
```

镜像 tag 同时打两个：commit SHA（精确定位）和分支名（`test` / `main`，方便快速查看当前部署版本）。

---

## 五、常用运维命令

```bash
# 查看所有服务状态
docker compose -f /opt/mallbay/docker-compose.prod.yml ps

# 实时查看日志
docker compose -f /opt/mallbay/docker-compose.prod.yml logs -f api
docker compose -f /opt/mallbay/docker-compose.prod.yml logs -f web

# 手动回滚到指定 commit（两台 ECS 分别执行）
cd /opt/mallbay
sed -i '/^IMAGE_TAG=/d' .env
echo "IMAGE_TAG=<commit-sha>" >> .env
docker compose -f docker-compose.prod.yml pull api web
docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate api web
```
