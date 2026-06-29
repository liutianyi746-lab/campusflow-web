# Vercel 预览版部署 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 campusflow-web 部署到 Vercel，数据库从 SQLite 迁移到 Vercel Postgres，预览版可访问。

**Architecture:** Next.js 16 通过 Vercel 的 GitHub 集成自动构建部署。Prisma + PostgreSQL 替代原来的 SQLite 本地文件数据库。环境变量通过 Vercel Dashboard 注入。

**Tech Stack:** Next.js 16.2.7, Prisma 6.19, PostgreSQL (Vercel Postgres), DeepSeek API

## Global Constraints

- 预览版，不需要生产级配置
- 不迁移本地 SQLite 数据
- 不绑定自定义域名
- 不配置 CI/CD

---

### Task 1: 初始化 Git 仓库

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: 创建 .gitignore 文件**

```bash
cat > .gitignore << 'EOF'
# dependencies
/node_modules
/.pnp
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/versions

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# env files
.env
.env.local
.env*.local

# typescript
*.tsbuildinfo
next-env.d.ts

# prisma
/prisma/dev.db
/prisma/dev.db-journal
EOF
```

- [ ] **Step 2: 初始化 Git 并首次提交**

```bash
git init
git add -A
git commit -m "chore: initial commit"
```

Expected: 成功创建初始 commit

---

### Task 2: Prisma Schema 迁移 SQLite → PostgreSQL

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 修改 schema.prisma provider**

将 `prisma/schema.prisma` 第 6 行的 `provider = "sqlite"` 改为 `provider = "postgresql"`：

修改前（第 5-7 行）：
```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

修改后：
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

- [ ] **Step 2: 暂不运行 migrate（本地没有 PostgreSQL）**

暂时只提交文件改动，等到 Vercel 上通过环境变量连接到 PostgreSQL 后再运行迁移：

```bash
git add prisma/schema.prisma
git commit -m "refactor: switch Prisma from SQLite to PostgreSQL"
```

> ⚠️ 注意：本地开发仍用 SQLite 的话，需要保留 `.env.local` 中的 `DATABASE_URL=file:./dev.db`。部署时 Vercel 会用 PostgreSQL 连接串覆盖。

---

### Task 3: 创建 GitHub 仓库并推送

- [ ] **Step 1: 在 GitHub 创建仓库**

```bash
gh repo create campusflow-web --private --source=. --remote=origin --push
```

Expected: 仓库创建成功，代码推送到 GitHub。

如果没有 `gh` CLI 登录，需要先运行：
```bash
gh auth login
```
然后按提示在浏览器中授权。

> 备选方案：如果 gh CLI 不可用，手动在 https://github.com/new 创建仓库，然后：
> ```bash
> git remote add origin https://github.com/<your-username>/campusflow-web.git
> git branch -M main
> git push -u origin main
> ```

- [ ] **Step 2: 确认推送成功**

```bash
git remote -v
```

Expected: 显示 origin 指向 GitHub 仓库。

---

### Task 4: Vercel 部署

- [ ] **Step 1: 登录 Vercel CLI 并关联项目**

```bash
npx vercel login
npx vercel link
```

按提示操作：
- 选择 "Set up and deploy"
- 关联到刚才创建的 GitHub 仓库
- 确认框架检测为 Next.js

- [ ] **Step 2: 在 Vercel Dashboard 添加 Vercel Postgres**

在浏览器中：
1. 打开 Vercel Dashboard → 选择 campusflow-web 项目
2. 点击 "Storage" 标签 → "Create Database" → 选择 "Postgres"
3. 创建后 Vercel 会自动注入 `DATABASE_URL`、`POSTGRES_URL` 等环境变量

- [ ] **Step 3: 添加 DeepSeek API Key 环境变量**

在 Vercel Dashboard → Settings → Environment Variables 中手动添加：

| Key | Value | Environment |
|-----|-------|-------------|
| `DEEPSEEK_API_KEY` | `sk-6cfd9af6687a4f4c9491e2abf1921e0f` | Production, Preview |

- [ ] **Step 4: 配置 Prisma Post-Install**

在 `package.json` 的 `scripts` 对象中添加 `postinstall` 脚本：

```json
"postinstall": "prisma generate"
```

完整 scripts 块变为：
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test:core": "node --test tests/core/*.test.ts",
  "postinstall": "prisma generate"
}
```

- [ ] **Step 5: 在 Vercel 上运行数据库迁移**

Vercel Postgres 创建好后，拉取环境变量并用 `prisma db push` 推送 schema（预览版不需要 migration 文件）：

```bash
npx vercel env pull .env.vercel
npx prisma db push
```

> ⚠️ 如果 `prisma db push` 报连接错误，确认 Vercel Postgres 已创建且状态为 "Ready"。

- [ ] **Step 6: 提交并推送触发部署**

```bash
git add package.json
git commit -m "chore: add postinstall script for Vercel build"
git push
```

Vercel 会自动检测到 push 并开始构建部署。

---

### Task 5: 验证部署

- [ ] **Step 1: 检查构建状态**

在 Vercel Dashboard 的 Deployments 标签中确认最新部署状态为 "Ready"。

或通过 CLI：
```bash
npx vercel list
```

- [ ] **Step 2: 访问部署域名**

Vercel 会生成预览域名（如 `campusflow-web-xxx.vercel.app`）。在浏览器中打开，确认：
- 首页正常加载（`/`）
- 上传页面正常（`/upload`）
- 页面无 500 错误

- [ ] **Step 3: 测试核心流程**

1. 访问 `/upload` → 上传一个课表图片
2. 确认 AI 解析流程能正常触发（DeepSeek API 调用）
3. 确认结果页面正常展示（`/result`）

- [ ] **Step 4: 检查数据库连接**

访问任意 API 路由读取数据库，确认无 "database connection" 错误。

---

### 回滚方案

如果部署失败需要回到本地 SQLite：

```bash
# 恢复 schema.prisma 的 provider
# 将 provider = "postgresql" 改回 provider = "sqlite"
# 恢复 .env.local 的 DATABASE_URL=file:./dev.db
npx prisma generate
```
