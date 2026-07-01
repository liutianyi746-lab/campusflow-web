import { existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = join(root, "src", "app", "api");
const disabledDir = join(root, ".next-static-api-disabled");
const nextBin = join(root, "node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next");
const nextDir = join(root, ".next");
const outDir = join(root, "out");
const polyfillSourcePath = join(root, "src", "lib", "browser", "mobile-polyfill-script.ts");

if (!process.env.NEXT_PUBLIC_API_BASE_URL?.trim()) {
  console.error("Static export needs NEXT_PUBLIC_API_BASE_URL, because GitHub Pages cannot run /api routes.");
  process.exit(1);
}

if (existsSync(disabledDir)) {
  console.error(`Refusing to build: temporary directory already exists: ${disabledDir}`);
  process.exit(1);
}

let moved = false;

function readMobilePolyfillScript() {
  const source = readFileSync(polyfillSourcePath, "utf8");
  const match = source.match(/export const MOBILE_POLYFILL_SCRIPT = `([\s\S]*)`;\s*$/);
  if (!match) {
    throw new Error(`Unable to read mobile polyfill script from ${polyfillSourcePath}`);
  }
  return match[1];
}

function htmlFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...htmlFiles(fullPath));
    if (entry.isFile() && entry.name.endsWith(".html")) found.push(fullPath);
  }
  return found;
}

function injectMobilePolyfills() {
  if (!existsSync(outDir)) return;

  const script = `<script id="campusflow-mobile-polyfills">${readMobilePolyfillScript()}</script>`;
  for (const htmlPath of htmlFiles(outDir)) {
    const html = readFileSync(htmlPath, "utf8")
      .replace(/<script[^>]*id="campusflow-mobile-polyfills"[^>]*>[\s\S]*?<\/script>/g, "");
    if (!html.includes("<head>")) {
      throw new Error(`Unable to inject mobile polyfills into ${htmlPath}: <head> not found`);
    }
    writeFileSync(htmlPath, html.replace("<head>", `<head>${script}`));
  }
}

try {
  if (existsSync(nextDir)) {
    rmSync(nextDir, { recursive: true, force: true });
  }

  if (existsSync(apiDir)) {
    renameSync(apiDir, disabledDir);
    moved = true;
  }

  const command = process.platform === "win32" ? "cmd.exe" : nextBin;
  const args = process.platform === "win32" ? ["/c", nextBin, "build"] : ["build"];
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, STATIC_EXPORT: "true" },
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    console.error(result.error);
  }

  process.exitCode = result.status ?? 1;
  if (process.exitCode === 0) {
    injectMobilePolyfills();
  }
} finally {
  if (moved) {
    renameSync(disabledDir, apiDir);
  }
}
