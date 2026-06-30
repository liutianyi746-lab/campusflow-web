import crypto from "node:crypto";
import { NextRequest } from "next/server";

import { corsJson, corsPreflight } from "@/lib/http/cors";
import { recognize } from "@/lib/ocr/paddle-ocr-stub";
import { extractPdfText } from "@/lib/pdf/pdf-text-extractor";

const SUPPORTED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/jpg",
  "image/webp",
  "application/pdf",
  "text/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const UNSUPPORTED_MOBILE_IMAGE_TYPES = new Set(["image/heic", "image/heif"]);
const SUPPORTED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "pdf", "csv", "txt", "xls", "xlsx"]);
const UNSUPPORTED_MOBILE_IMAGE_EXTENSIONS = new Set(["heic", "heif"]);
const SOURCE_BY_EXTENSION = new Map([
  ["csv", "EXCEL"],
  ["txt", "TEXT"],
]);
const PDF_EXTENSIONS = new Set(["pdf"]);
const TEXT_EXTENSIONS = new Set(["csv", "txt"]);
const MAX_FILE_SIZE_MB = 25;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
const HEIC_ERROR_MESSAGE = "iPhone HEIC/HEIF 暂不支持识别，请改为 JPG/PNG/WebP，或截图后再上传。";

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const purpose = form.get("purpose") === "schedule" ? "schedule" : "event";
    if (!file) {
      return corsJson(
        {
          success: false,
          error: { code: "INVALID_FILE", message: "未找到上传文件" },
        },
        { status: 400 },
        req,
      );
    }

    if (isUnsupportedMobileImage(file)) {
      return corsJson(
        {
          success: false,
          error: { code: "UNSUPPORTED_HEIC", message: HEIC_ERROR_MESSAGE },
        },
        { status: 415 },
        req,
      );
    }

    if (!isSupportedUploadFile(file)) {
      return corsJson(
        {
          success: false,
          error: {
            code: "INVALID_FILE",
            message: "支持 JPG、PNG、WebP 图片、PDF、Excel、CSV 和文本文件",
          },
        },
        { status: 400 },
        req,
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return corsJson(
        {
          success: false,
          error: { code: "FILE_TOO_LARGE", message: `文件不能超过 ${MAX_FILE_SIZE_MB}MB` },
        },
        { status: 400 },
        req,
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extension = fileExtension(file);

    if (file.type === "application/pdf" || PDF_EXTENSIONS.has(extension)) {
      const extracted = await extractPdfText(buffer);
      if (extracted) {
        return corsJson({ success: true, data: extracted }, undefined, req);
      }
    }

    if (file.type === "text/plain" || file.type === "text/csv" || TEXT_EXTENSIONS.has(extension)) {
      const text = buffer.toString("utf8");
      return corsJson(
        {
          success: true,
          data: {
            success: true,
            ocrText: text,
            confidence: 1,
            processingTimeMs: 0,
            inputHash: cryptoHash(buffer),
            source: SOURCE_BY_EXTENSION.get(extension) ?? (file.type === "text/csv" ? "EXCEL" : "TEXT"),
          },
        },
        undefined,
        req,
      );
    }

    const data = await recognize(buffer, file.type || mimeTypeForExtension(extension), { purpose });
    return corsJson({ success: true, data }, undefined, req);
  } catch (error) {
    return corsJson(
      {
        success: false,
        error: { code: "OCR_FAILED", message: String(error) },
      },
      { status: 500 },
      req,
    );
  }
}

function fileExtension(file: File): string {
  return file.name.toLowerCase().split(".").pop() ?? "";
}

function isUnsupportedMobileImage(file: File): boolean {
  const extension = fileExtension(file);
  return UNSUPPORTED_MOBILE_IMAGE_TYPES.has(file.type) || UNSUPPORTED_MOBILE_IMAGE_EXTENSIONS.has(extension);
}

function isSupportedUploadFile(file: File): boolean {
  const extension = fileExtension(file);
  return SUPPORTED_TYPES.has(file.type) || SUPPORTED_EXTENSIONS.has(extension);
}

function mimeTypeForExtension(extension: string): string | undefined {
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return undefined;
}

function cryptoHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}