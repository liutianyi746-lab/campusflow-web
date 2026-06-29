import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { recognize } from "@/lib/ocr/paddle-ocr-stub";
import { extractPdfText } from "@/lib/pdf/pdf-text-extractor";

const SUPPORTED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/jpg",
  "application/pdf",
  "text/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const purpose = form.get("purpose") === "schedule" ? "schedule" : "event";
    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_FILE", message: "未找到上传文件" },
        },
        { status: 400 },
      );
    }

    if (!SUPPORTED_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_FILE",
            message: "支持图片、PDF、Excel、CSV 和文本文件",
          },
        },
        { status: 400 },
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "FILE_TOO_LARGE", message: "文件不能超过 10MB" },
        },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (file.type === "application/pdf") {
      const extracted = await extractPdfText(buffer);
      if (extracted) {
        return NextResponse.json({ success: true, data: extracted });
      }
    }

    if (file.type === "text/plain" || file.type === "text/csv") {
      const text = buffer.toString("utf8");
      return NextResponse.json({
        success: true,
        data: {
          success: true,
          ocrText: text,
          confidence: 1,
          processingTimeMs: 0,
          inputHash: cryptoHash(buffer),
          source: file.type === "text/csv" ? "EXCEL" : "TEXT",
        },
      });
    }

    const data = await recognize(buffer, file.type, { purpose });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "OCR_FAILED", message: String(error) },
      },
      { status: 500 },
    );
  }
}

function cryptoHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}




