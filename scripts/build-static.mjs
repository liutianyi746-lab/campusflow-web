import { existsSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = join(root, "src", "app", "api");
const disabledDir = join(root, ".next-static-api-disabled");
const nextBin = join(root, "node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next");
const nextDir = join(root, ".next");

if (!process.env.NEXT_PUBLIC_API_BASE_URL?.trim()) {
  console.error("Static export needs NEXT_PUBLIC_API_BASE_URL, because GitHub Pages cannot run /api routes.");
  process.exit(1);
}

if (existsSync(disabledDir)) {
  console.error(`Refusing to build: temporary directory already exists: ${disabledDir}`);
  process.exit(1);
}

let moved = false;
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
} finally {
  if (moved) {
    renameSync(disabledDir, apiDir);
  }
}