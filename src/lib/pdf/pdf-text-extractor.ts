import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { extractScheduleFromPdfContent } from "./direct-schedule-extractor.ts";
import { extractPdfTextWithPdfJs } from "./pdfjs-fallback-extractor.ts";

const execFileAsync = promisify(execFile);

type PdfExtractionPayload = {
  success?: boolean;
  text?: string;
  mode?: "table" | "text";
  count?: number;
  semesterStart?: string | null;
  error?: string;
};

export type PdfTextExtraction = {
  ocrText: string;
  confidence: number;
  inputHash: string;
  processingTimeMs: number;
  source: "PDF";
  warnings: string[];
  semesterStart?: string;
};

function extractionToResult(
  payload: PdfExtractionPayload,
  buffer: Buffer,
  startedAt: number,
  warnings: string[] = [],
): PdfTextExtraction | null {
  const text = payload.text?.trim();
  if (!payload.success || !text) return null;

  return {
    ocrText: text,
    confidence: payload.mode === "table" ? 0.95 : 0.78,
    inputHash: crypto.createHash("sha256").update(buffer).digest("hex"),
    processingTimeMs: Date.now() - startedAt,
    source: "PDF",
    warnings: [
      ...warnings,
      ...(payload.mode === "table" ? [] : ["PDF 未识别到表格结构，已使用文本抽取结果。"]),
    ],
    semesterStart: payload.semesterStart ?? undefined,
  };
}

function pythonCandidates(): Array<{ command: string; argsPrefix: string[] }> {
  const userProfile = process.env.USERPROFILE;
  const bundled = userProfile
    ? path.join(userProfile, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe")
    : undefined;

  return [
    ...(bundled && existsSync(bundled) ? [{ command: bundled, argsPrefix: [] }] : []),
    { command: "py", argsPrefix: ["-3"] },
    { command: "python", argsPrefix: [] },
  ];
}

async function runExtractor(pdfPath: string): Promise<PdfExtractionPayload> {
  const scriptPath = path.join(process.cwd(), "src", "lib", "pdf", "extract_schedule_pdf.py");
  const errors: string[] = [];

  for (const candidate of pythonCandidates()) {
    try {
      const { stdout } = await execFileAsync(
        candidate.command,
        [...candidate.argsPrefix, scriptPath, pdfPath],
        {
          encoding: "utf8",
          maxBuffer: 1024 * 1024 * 8,
          windowsHide: true,
          env: { ...process.env, PYTHONIOENCODING: "utf-8" },
        },
      );
      return JSON.parse(stdout) as PdfExtractionPayload;
    } catch (error) {
      errors.push(`${candidate.command}: ${String(error)}`);
    }
  }

  return { success: false, error: errors.join(" | ") };
}

export async function extractPdfText(buffer: Buffer): Promise<PdfTextExtraction | null> {
  const startedAt = Date.now();
  const direct = extractionToResult(extractScheduleFromPdfContent(buffer) ?? {}, buffer, startedAt);
  if (direct) return direct;

  const dir = await mkdtemp(path.join(os.tmpdir(), "campusflow-pdf-"));
  const pdfPath = path.join(dir, "input.pdf");

  try {
    await writeFile(pdfPath, buffer);
    const payload = await runExtractor(pdfPath);
    const pythonResult = extractionToResult(payload, buffer, startedAt);
    if (pythonResult) return pythonResult;

    const fallback = await extractPdfTextWithPdfJs(buffer);
    return extractionToResult(fallback, buffer, startedAt, [
      "Python PDF 表格抽取不可用，已使用线上兼容的 PDF.js 抽取。",
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
