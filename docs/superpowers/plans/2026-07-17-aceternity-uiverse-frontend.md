# CampusFlow 前端视觉优化实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框跟踪进度。

**目标：** 在不改变 CampusFlow 业务逻辑的前提下，将五个产品页面统一升级为已批准的深墨绿「克制融合」视觉系统。

**架构：** 以 `globals.css` 定义设计令牌、背景、通用表面和动效，以少量共享 React 组件承载按钮、面板和页面标题；各路由只调整结构类名与展示层。业务状态、上传解析、事件编辑和 ICS 导出代码保持原样。

**技术栈：** Next.js 16、React 19、TypeScript、Tailwind CSS 4、CSS animations、Node test runner。

---

## 文件结构

- 创建 `src/app/_components/ui-shell.tsx`：提供 `GlassPanel`、`PageIntro`、`GlowButton` 三个无状态展示组件。
- 创建 `tests/core/ui-shell.test.ts`：静态验证共享组件的语义元素、可复用类名和 reduced-motion 契约。
- 修改 `src/app/globals.css`：设计令牌、深色背景、聚光/网格、通用交互类、焦点与减少动态效果。
- 修改 `src/app/layout.tsx`：全局深色导航、品牌标识、页面容器和页脚。
- 修改 `src/app/_components/step-indicator.tsx`：四步流程视觉状态与移动端布局。
- 修改 `src/app/page.tsx`：首页首屏、事件流、数据与流程卡片。
- 修改 `src/app/upload/page.tsx`：来源选择、上传/文本输入、状态和设置面板样式，不动处理函数。
- 修改 `src/app/result/page.tsx`：统计卡、结果表格、标签与操作区样式。
- 修改 `src/app/editor/page.tsx`：事件列表、编辑面板、日期管理和导出操作样式。
- 修改 `src/app/export/page.tsx`：成功状态、日历说明和返回操作样式。

### 任务 1：建立共享视觉基础

**文件：**
- 创建：`tests/core/ui-shell.test.ts`
- 创建：`src/app/_components/ui-shell.tsx`
- 修改：`src/app/globals.css`

- [ ] **步骤 1：编写失败的共享 UI 契约测试**

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("shared UI shell exposes semantic primitives and motion fallback", async () => {
  const component = await readFile("src/app/_components/ui-shell.tsx", "utf8");
  const css = await readFile("src/app/globals.css", "utf8");
  assert.match(component, /export function GlassPanel/);
  assert.match(component, /export function PageIntro/);
  assert.match(component, /export function GlowButton/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.glass-panel/);
  assert.match(css, /\.glow-button/);
});
```

- [ ] **步骤 2：运行测试并确认失败**

运行：`node --test tests/core/ui-shell.test.ts`  
预期：FAIL，提示 `ui-shell.tsx` 不存在或缺少目标导出。

- [ ] **步骤 3：实现共享展示组件**

```tsx
import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function GlassPanel({ className, ...props }: ComponentPropsWithoutRef<"section">) {
  return <section className={cn("glass-panel", className)} {...props} />;
}

export function PageIntro({ eyebrow, title, description, actions }: {
  eyebrow: string; title: string; description: string; actions?: ReactNode;
}) {
  return <header className="page-intro"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p>{actions}</header>;
}

export function GlowButton({ href, children, className }: {
  href: string; children: ReactNode; className?: string;
}) {
  return <Link href={href} className={cn("glow-button", className)}>{children}</Link>;
}
```

- [ ] **步骤 4：实现全局设计令牌与交互类**

在 `globals.css` 中加入 `--surface`、`--line`、`--muted`、`--brand` 等变量；实现 `.glass-panel`、`.glow-button`、`.secondary-button`、`.eyebrow`、`.ambient-grid`、`.shine-card`、统一 `:focus-visible`，并在 `@media (prefers-reduced-motion: reduce)` 中关闭位移和循环动画。

- [ ] **步骤 5：运行共享 UI 测试**

运行：`node --test tests/core/ui-shell.test.ts`  
预期：PASS。

- [ ] **步骤 6：提交基础视觉系统**

```bash
git add src/app/globals.css src/app/_components/ui-shell.tsx tests/core/ui-shell.test.ts
git commit -m "feat: add shared visual system"
```

### 任务 2：改造全局框架与流程指示器

**文件：**
- 修改：`src/app/layout.tsx`
- 修改：`src/app/_components/step-indicator.tsx`
- 测试：`tests/core/ui-shell.test.ts`

- [ ] **步骤 1：扩展静态契约测试**

```ts
test("layout and step indicator use the shared visual language", async () => {
  const layout = await readFile("src/app/layout.tsx", "utf8");
  const steps = await readFile("src/app/_components/step-indicator.tsx", "utf8");
  assert.match(layout, /ambient-grid/);
  assert.match(layout, /glass-nav/);
  assert.match(steps, /step-track/);
  assert.match(steps, /aria-current/);
});
```

- [ ] **步骤 2：运行测试并确认新增断言失败**

运行：`node --test tests/core/ui-shell.test.ts`  
预期：FAIL，缺少全局框架和步骤类名。

- [ ] **步骤 3：更新布局和步骤组件**

在 `layout.tsx` 添加深色玻璃导航、单色品牌核心、环境背景层和统一内容宽度；在 `step-indicator.tsx` 保留四个链接，为当前项设置 `aria-current="step"`，按 done/active/idle 映射 `.step-track` 状态类。

- [ ] **步骤 4：运行测试并提交**

运行：`node --test tests/core/ui-shell.test.ts`  
预期：PASS。

```bash
git add src/app/layout.tsx src/app/_components/step-indicator.tsx tests/core/ui-shell.test.ts
git commit -m "feat: refresh application shell"
```

### 任务 3：重构首页视觉层

**文件：**
- 修改：`src/app/page.tsx`
- 测试：`tests/core/ui-shell.test.ts`

- [ ] **步骤 1：添加首页视觉契约测试**

```ts
test("landing page contains the selected fusion direction", async () => {
  const page = await readFile("src/app/page.tsx", "utf8");
  assert.match(page, /hero-orbit/);
  assert.match(page, /event-stream/);
  assert.match(page, /shine-card/);
  assert.match(page, /GlowButton/);
});
```

- [ ] **步骤 2：运行测试并确认失败**

运行：`node --test tests/core/ui-shell.test.ts`  
预期：FAIL，首页尚未使用融合视觉结构。

- [ ] **步骤 3：实现首页首屏和流程区域**

保留 `PREVIEW_EVENTS` 与 `/upload`、`/editor` 导航目标；使用 `GlowButton` 和 `GlassPanel` 重组双栏首屏，添加 `.hero-orbit`、`.event-stream` 和四张 `.shine-card`，不新增客户端状态。

- [ ] **步骤 4：运行测试并提交**

运行：`node --test tests/core/ui-shell.test.ts`  
预期：PASS。

```bash
git add src/app/page.tsx tests/core/ui-shell.test.ts
git commit -m "feat: redesign landing experience"
```

### 任务 4：统一上传与确认页面

**文件：**
- 修改：`src/app/upload/page.tsx`
- 修改：`src/app/result/page.tsx`
- 测试：`tests/core/ui-shell.test.ts`

- [ ] **步骤 1：添加工作流页面契约测试**

```ts
test("upload and result retain workflow hooks with refreshed surfaces", async () => {
  const upload = await readFile("src/app/upload/page.tsx", "utf8");
  const result = await readFile("src/app/result/page.tsx", "utf8");
  assert.match(upload, /upload-zone/);
  assert.match(upload, /source-preset/);
  assert.match(result, /metric-card/);
  assert.match(result, /result-table/);
  assert.match(upload, /handleFile/);
  assert.match(result, /router\.push\("\/editor"\)/);
});
```

- [ ] **步骤 2：运行测试并确认失败**

运行：`node --test tests/core/ui-shell.test.ts`  
预期：FAIL，视觉类名尚未接入。

- [ ] **步骤 3：替换上传页展示类名**

仅修改 JSX 展示层：页面标题、来源预设、上传区、文本输入、作息设置、加载和错误状态；保留 `handleFile`、`parseText`、preset 数据、状态变量及所有事件处理函数。

- [ ] **步骤 4：替换确认页展示类名**

将统计块改为 `.metric-card`，表格容器改为 `.result-table`，统一标签和 CTA；保留事件统计计算和路由行为。

- [ ] **步骤 5：运行测试并提交**

运行：`node --test tests/core/ui-shell.test.ts`  
预期：PASS。

```bash
git add src/app/upload/page.tsx src/app/result/page.tsx tests/core/ui-shell.test.ts
git commit -m "feat: refresh upload and review workflow"
```

### 任务 5：统一编辑与导出页面

**文件：**
- 修改：`src/app/editor/page.tsx`
- 修改：`src/app/export/page.tsx`
- 测试：`tests/core/ui-shell.test.ts`

- [ ] **步骤 1：添加编辑与导出页面契约测试**

```ts
test("editor and export expose refreshed task surfaces", async () => {
  const editor = await readFile("src/app/editor/page.tsx", "utf8");
  const output = await readFile("src/app/export/page.tsx", "utf8");
  assert.match(editor, /event-list-panel/);
  assert.match(editor, /editor-panel/);
  assert.match(output, /export-success/);
  assert.match(output, /calendar-card/);
  assert.match(editor, /exportIcs/);
});
```

- [ ] **步骤 2：运行测试并确认失败**

运行：`node --test tests/core/ui-shell.test.ts`  
预期：FAIL，两个页面尚未接入新表面类。

- [ ] **步骤 3：更新编辑页展示层**

为事件列表、选中项、编辑表单、停课日期和补充事件区域应用 `.event-list-panel`、`.editor-panel` 与统一表单状态；保留所有 store 调用、事件选择、更新、删除及导出函数。

- [ ] **步骤 4：更新导出页展示层**

使用 `.export-success` 构建成功视觉中心，为三种日历说明应用 `.calendar-card`，保留返回 `/editor` 与 `/` 的行为。

- [ ] **步骤 5：运行测试并提交**

运行：`node --test tests/core/ui-shell.test.ts`  
预期：PASS。

```bash
git add src/app/editor/page.tsx src/app/export/page.tsx tests/core/ui-shell.test.ts
git commit -m "feat: refresh editing and export surfaces"
```

### 任务 6：完整验证与收尾

**文件：**
- 检查：上述全部修改文件

- [ ] **步骤 1：运行核心测试**

运行：`npm run test:core`  
预期：全部测试 PASS。

- [ ] **步骤 2：运行代码检查**

运行：`npm run lint`  
预期：退出码 0；若发现既有问题，确认其文件未被本计划修改并单独记录。

- [ ] **步骤 3：运行生产构建**

运行：`npm run build`  
预期：Next.js 构建成功，所有页面完成编译。

- [ ] **步骤 4：检查变更边界**

运行：`git diff --check` 与 `git status --short`  
预期：无空白错误；仅出现计划内文件或用户原有修改。

- [ ] **步骤 5：提交验证修正（仅在存在修正时）**

```bash
git add <本轮验证修正的计划内文件>
git commit -m "fix: polish frontend visual refresh"
```
