# Vercel 预览版部署 — 设计文档

**日期**: 2026-06-29
**状态**: 已批准

## 目标

将 campusflow-web（Next.js 16 + Prisma + DeepSeek API）部署到 Vercel 作为预览版，能跑即可，不追求生产级完整性。

## 方案选择

| 维度 | 决定 |
|------|------|
| 部署平台 | Vercel |
| 数据库 | Vercel Postgres（Prisma 从 SQLite 迁移到 PostgreSQL）|
| 环境 | 预览/测试 |
| 源码托管 | GitHub |

## 部署步骤

### 1. 数据库迁移：SQLite → PostgreSQL

**文件改动：`prisma/schema.prisma`**

- 将 `provider = "sqlite"` 改为 `provider = "postgresql"`
- `@default(uuid())` → PostgreSQL 兼容，无需修改
- `Boolean` → 在 PG 中就是 `boolean`，无需修改
- `DateTime` → 在 PG 中就是 `timestamp`，无需修改
- `Json` → 在 PG 中就是 `jsonb`，无需修改
- SQLite `file:./dev.db` 替换为 Vercel Postgres 连接串

### 2. 环境变量

| 变量 | 用途 | 来源 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 连接串 | Vercel Postgres 自动注入 |
| `DEEPSEEK_API_KEY` | AI 课表解析 | 已有的 `.env.local` |

### 3. 推送到 GitHub

项目需要先推到 GitHub 仓库，Vercel 才能关联部署。

### 4. Vercel 关联部署

Vercel Dashboard 导入 GitHub 仓库，自动识别 Next.js 项目。

### 5. 验证

- 访问 Vercel 域名确认页面加载
- 测试核心流程

## 不在范围内

- 本地数据迁移
- CI/CD 自动化
- 域名绑定
- 错误监控

## 风险

- **Prisma 迁移**：SQLite 特有语法可能不兼容 PG
- **DeepSeek API 超时**：Vercel Serverless 函数有时间限制（hobby 10s, pro 60s）
