import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const isStaticExport = process.env.STATIC_EXPORT === "true";
const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim();
const normalizedBasePath = configuredBasePath
  ? `/${configuredBasePath.replace(/^\/+|\/+$/g, "")}`
  : "";

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  ...(isStaticExport
    ? {
        output: "export" as const,
        trailingSlash: true,
        images: {
          unoptimized: true,
        },
        ...(normalizedBasePath
          ? {
              basePath: normalizedBasePath,
              assetPrefix: normalizedBasePath,
            }
          : {}),
      }
    : {}),
};

export default nextConfig;