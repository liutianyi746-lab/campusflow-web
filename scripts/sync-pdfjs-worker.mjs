import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(join(root, "node_modules", "pdfjs-dist", "package.json"), "utf8"));
const source = join(root, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs");
const destination = join(root, "public", "pdfjs", "pdf.worker.mjs");
const workerSource = readFileSync(source, "utf8");
const build = workerSource.match(/pdfjsBuild = ([^\r\n]+)/)?.[1]?.trim() ?? "unknown";

copyFileSync(source, destination);
writeFileSync(
  join(root, "public", "pdfjs", "worker-meta.json"),
  `${JSON.stringify({ version: packageJson.version, build, flavor: "legacy" }, null, 2)}\n`,
);

