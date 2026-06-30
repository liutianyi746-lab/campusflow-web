# GitHub Pages + 独立 API 部署

这个项目现在支持两种运行方式：

- 本地/服务器一体运行：`npm run build && npm run start`，前端和 `/api/*` 都在同一个 Next 服务里。
- GitHub Pages 静态前端 + 独立 API 后端：Pages 只放页面，识别、解析、ICS 导出继续由 Next API 服务处理。

## 功能差异

用户看到的功能应该保持一致：上传图片/PDF/Excel/文本、生成事件、编辑事件、导出 ICS 都还在。

差异主要在部署方式：

- GitHub Pages 不能运行 OCR、PDF 解析、ICS 生成这些服务端代码，所以它必须请求一个单独的后端地址。
- 图片识别依赖当前后端的 OCR 环境。现在的 Windows OCR 能力建议继续部署在 Windows 机器或支持同等 OCR 的服务器上。
- 数据仍然是 Zustand 内存态，没有登录、没有数据库持久化、没有原生日历同步。

## 后端 API

在后端机器上运行：

```bash
npm ci
npm run build
npm run start
```

后端需要配置允许 Pages 跨域请求：

```bash
CORS_ALLOW_ORIGIN=https://你的用户名.github.io
```

如果只给朋友临时测试，也可以先设为：

```bash
CORS_ALLOW_ORIGIN=*
```

后端公开地址示例：

```text
https://api.example.com
```

前端会请求：

```text
https://api.example.com/api/upload
https://api.example.com/api/parse
https://api.example.com/api/ics
```

## GitHub Pages 前端

在 GitHub 仓库的 Settings -> Pages 里选择 GitHub Actions。

然后在 Settings -> Secrets and variables -> Actions -> Variables 里加：

```text
NEXT_PUBLIC_API_BASE_URL=https://你的后端域名
NEXT_PUBLIC_BASE_PATH=/仓库名
```

如果仓库是用户主页仓库，比如 `liutianyi746.github.io`，`NEXT_PUBLIC_BASE_PATH` 可以留空。
如果仓库是普通项目，比如 `campusflow-web`，就填：

```text
/campusflow-web
```

推送到 `main` 或 `master` 后，`.github/workflows/pages.yml` 会自动构建并部署 `out/` 到 GitHub Pages。

## 本地测试静态导出

PowerShell 示例：

```powershell
$env:STATIC_EXPORT="true"
$env:NEXT_PUBLIC_API_BASE_URL="http://localhost:3000"
$env:NEXT_PUBLIC_BASE_PATH=""
npm run build:static
```

生成结果在 `out/`。`npm run build:static` 会临时把 `src/app/api` 移出静态构建范围，构建完成后自动恢复；这是因为 GitHub Pages 只部署前端，后端 API 需要单独运行。