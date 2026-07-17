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

test("layout and step indicator use the shared visual language", async () => {
  const layout = await readFile("src/app/layout.tsx", "utf8");
  const steps = await readFile("src/app/_components/step-indicator.tsx", "utf8");
  assert.match(layout, /ambient-grid/);
  assert.match(layout, /glass-nav/);
  assert.match(steps, /step-track/);
  assert.match(steps, /aria-current/);
});

test("landing page contains the selected fusion direction", async () => {
  const page = await readFile("src/app/page.tsx", "utf8");
  assert.match(page, /hero-orbit/);
  assert.match(page, /event-stream/);
  assert.match(page, /shine-card/);
  assert.match(page, /GlowButton/);
});

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
