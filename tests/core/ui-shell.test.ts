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
