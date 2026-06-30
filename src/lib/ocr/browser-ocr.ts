import type { EventSource } from "@/lib/types/campus-event";

export type BrowserOcrResult = {
  success: boolean;
  ocrText: string;
  confidence: number;
  processingTimeMs: number;
  inputHash: string;
  source: EventSource;
  error?: string;
};

type CanvasVariant = {
  name: string;
  canvas: HTMLCanvasElement;
};

function scoreOcrText(value: string): number {
  const text = value.replace(/\s+/g, " ");
  const dateCount = (text.match(/(?:20\d{2}\s*年?)?\s*\d{1,2}\s*月\s*\d{1,2}\s*日?/g) ?? []).length;
  const timeCount = (text.match(/\d{1,2}\s*:\s*\d{2}/g) ?? []).length;
  const locationCount = (text.match(/(?:经世楼|颐德楼|明德楼|笃行楼|教学楼|实验楼|晨曦排球场)\s*[A-Za-z]?\s*\d{0,4}/g) ?? []).length;
  const titleCount = (text.match(/(?:数据结构|面向对象|中国传统文化|心理健康|离散数学|中国近现代史|高等数学|马克思主义|概率论|大学物理|计算机网络|数字经济|算法分析)/g) ?? []).length;
  const slotCount = (text.match(/周[一二三四五六日天]|\d{1,2}\s*[-~至到]\s*\d{1,2}\s*节/g) ?? []).length;
  const noisePenalty = /注意事项|有效身份证|打印时间/.test(text) ? 12 : 0;

  return dateCount * 8 + timeCount * 5 + locationCount * 7 + titleCount * 6 + slotCount * 4 + Math.min(text.length, 1000) / 120 - noisePenalty;
}

async function fileHash(file: File): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("图片解码失败"));
    });
    image.src = url;
    await loaded;
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function makeCanvas(
  image: HTMLImageElement,
  crop: { sx: number; sy: number; sw: number; sh: number },
  targetWidth: number,
): HTMLCanvasElement {
  const scale = targetWidth / crop.sw;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(crop.sw * scale);
  canvas.height = Math.round(crop.sh * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("图片处理失败");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.filter = "grayscale(1) contrast(1.25) brightness(1.04)";
  context.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function variantsFor(image: HTMLImageElement): CanvasVariant[] {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const variants: CanvasVariant[] = [
    {
      name: "full",
      canvas: makeCanvas(image, { sx: 0, sy: 0, sw: width, sh: height }, 1800),
    },
  ];

  if (height / width > 1.25) {
    variants.push({
      name: "portrait-mid",
      canvas: makeCanvas(
        image,
        { sx: 0, sy: Math.round(height * 0.18), sw: width, sh: Math.round(height * 0.52) },
        1800,
      ),
    });
    variants.push({
      name: "portrait-table",
      canvas: makeCanvas(
        image,
        {
          sx: Math.round(width * 0.05),
          sy: Math.round(height * 0.25),
          sw: Math.round(width * 0.9),
          sh: Math.round(height * 0.28),
        },
        2200,
      ),
    });
  }

  return variants;
}

export async function recognizeImageInBrowser(
  file: File,
  onStatus?: (status: string) => void,
): Promise<BrowserOcrResult> {
  const startedAt = Date.now();
  const inputHash = await fileHash(file);
  let worker: Awaited<ReturnType<typeof import("tesseract.js").createWorker>> | undefined;

  try {
    onStatus?.("正在加载浏览器 OCR...");
    const [{ createWorker, OEM, PSM }, image] = await Promise.all([
      import("tesseract.js"),
      loadImage(file),
    ]);
    const variants = variantsFor(image);
    worker = await createWorker("chi_sim+eng", OEM.LSTM_ONLY, {
      gzip: true,
    });

    let best: { text: string; confidence: number; score: number } | null = null;
    for (const psm of [PSM.AUTO, PSM.SPARSE_TEXT]) {
      await worker.setParameters({
        tessedit_pageseg_mode: psm,
        preserve_interword_spaces: "1",
      });

      for (const variant of variants) {
        onStatus?.(`正在识别图片 ${variant.name === "portrait-table" ? "表格区域" : "文字区域"}...`);
        const result = await worker.recognize(variant.canvas);
        const text = result.data.text.replace(/\s+/g, " ").trim();
        const score = scoreOcrText(text)
          + (result.data.confidence ?? 0) / 100
          + (variant.name.includes("table") ? 20 : 0)
          + (psm === PSM.SPARSE_TEXT ? 8 : 0);

        if (!best || score > best.score) {
          best = {
            text,
            confidence: Math.max(0, Math.min(1, (result.data.confidence ?? 0) / 100)),
            score,
          };
        }
      }
    }

    return {
      success: Boolean(best?.text),
      ocrText: best?.text ?? "",
      confidence: best?.confidence ?? 0,
      processingTimeMs: Date.now() - startedAt,
      inputHash,
      source: "IMAGE",
      error: best?.text ? undefined : "浏览器 OCR 未识别到有效文字，请裁剪清晰后重试。",
    };
  } catch (error) {
    return {
      success: false,
      ocrText: "",
      confidence: 0,
      processingTimeMs: Date.now() - startedAt,
      inputHash,
      source: "IMAGE",
      error: String(error),
    };
  } finally {
    await worker?.terminate();
  }
}
