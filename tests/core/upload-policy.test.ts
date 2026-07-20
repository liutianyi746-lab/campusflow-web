import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const uploadPage = readFileSync("src/app/upload/page.tsx", "utf8");
const rootLayout = readFileSync("src/app/layout.tsx", "utf8");
const buildStaticScript = readFileSync("scripts/build-static.mjs", "utf8");
const uploadRoute = readFileSync("src/app/api/upload/route.ts", "utf8");
const preprocessScript = readFileSync("src/lib/ocr/preprocess_timetable_image.py", "utf8");
const browserOcr = readFileSync("src/lib/ocr/browser-ocr.ts", "utf8");
const browserPdf = readFileSync("src/lib/pdf/browser-pdf.ts", "utf8");
const mobilePolyfills = readFileSync("src/lib/browser/mobile-polyfills.ts", "utf8");
const localRecognizer = readFileSync("src/lib/parser/local-recognizer.ts", "utf8");

describe("mobile upload policy", () => {
  it("renders image-only PDF pages and runs timetable OCR when extracted text is sparse", () => {
    assert.match(browserPdf, /recognizeImageInBrowser/);
    assert.match(browserPdf, /page\.render/);
    assert.match(browserPdf, /isSparsePdfText/);
    assert.match(uploadPage, /isSparsePdfText/);
    assert.match(uploadPage, /extractPdfAfterUploadFailure\(uploadFile, setStatus\)/);
    const pdfFailureFallback = uploadPage.indexOf("isPdfUploadFile(uploadFile) && uploadResponse.data?.success === false");
    assert.notEqual(pdfFailureFallback, -1);
    assert.ok(
      pdfFailureFallback < uploadPage.indexOf("if (uploadResponse.data?.success === false)"),
      "PDF browser OCR fallback must run before generic OCR failures are thrown",
    );
  });

  it("lets phone browsers pick images and supports WebP screenshots", () => {
    assert.match(uploadPage, /IMAGE_FILE_ACCEPT = "image\/\*/);
    assert.match(uploadPage, /accept={fileAccept}/);
    assert.match(uploadPage, /image\/webp/);
    assert.match(uploadRoute, /image\/webp/);
  });

  it("tries to convert mobile photos before falling back to HEIC guidance", () => {
    assert.match(uploadPage, /prepareFileForUpload/);
    assert.match(uploadPage, /convertImageToJpeg/);
    assert.match(uploadPage, /image\/heic/);
    assert.match(uploadPage, /image\/heif/);
    assert.match(uploadPage, /HEIC\/HEIF 暂不支持识别/);
    assert.match(uploadRoute, /UNSUPPORTED_HEIC/);
  });

  it("keeps clear phone screenshots lossless instead of recompressing them", () => {
    assert.match(uploadPage, /LOSSLESS_IMAGE_TYPES/);
    assert.match(uploadPage, /isLosslessScreenshot/);
    assert.match(uploadPage, /return \{ file, previewUrl \}/);
    assert.match(uploadPage, /canvas\.toBlob[\s\S]*"image\/jpeg", 0\.94/);
    assert.match(uploadPage, /const maxSide = 3600/);
  });
  it("uses a larger limit for phone photos on both client and server", () => {
    assert.match(uploadPage, /MAX_FILE_SIZE_MB\s*=\s*25/);
    assert.match(uploadRoute, /MAX_FILE_SIZE_MB\s*=\s*25/);
  });

  it("keeps source choices and file picker usable in mobile browsers", () => {
    assert.match(uploadPage, /grid-cols-2/);
    assert.doesNotMatch(uploadPage, /overflow-x-auto/);
    assert.doesNotMatch(uploadPage, /className="hidden"/);
    assert.doesNotMatch(uploadPage, /className="sr-only"/);
    assert.doesNotMatch(uploadPage, /absolute inset-0/);
    assert.doesNotMatch(uploadPage, /opacity-0/);
    assert.match(uploadPage, /type="file"/);
    assert.match(uploadPage, /file:mr-4/);
    assert.match(uploadPage, /PDF_FILE_ACCEPT/);
    assert.match(uploadPage, /EXCEL_FILE_ACCEPT/);
    assert.match(uploadPage, /\.pdf/);
    assert.match(uploadPage, /\.xls/);
    assert.match(uploadPage, /\.xlsx/);
  });

  it("crops admission-ticket table rows for exam screenshots", () => {
    assert.match(preprocessScript, /build_exam_row_targets/);
    assert.match(preprocessScript, /"kind": "examRow"/);
    assert.match(preprocessScript, /exam_row_/);
  });
  it("does not continue to event generation when OCR or parsing returns nothing", () => {
    assert.match(uploadPage, /uploadResponse\.data\?\.success\s*===\s*false/);
    assert.match(uploadPage, /uploadResponse\.data\?\.ocrText\?\.trim\(\)/);
    assert.match(uploadPage, /parsedEvents\.length/);
    assert.match(uploadPage, /没有识别到可生成的时间事件/);
  });

  it("sends uploaded files to the backend instead of loading heavy browser OCR parsers", () => {
    assert.doesNotMatch(uploadPage, /recognizeImageInBrowser/);
    assert.doesNotMatch(uploadPage, /USE_BROWSER_IMAGE_OCR/);
    assert.doesNotMatch(uploadPage, /USE_BROWSER_PDF_EXTRACTION/);
    assert.match(uploadPage, /fetch\(apiUrl\("\/api\/upload"\)/);
    assert.match(uploadPage, /formData\.append\("file", uploadFile\)/);
  });

  it("falls back to local PDF extraction when phone uploads time out", () => {
    assert.match(uploadPage, /import \{ extractPdfInBrowser, isSparsePdfText \} from "@\/lib\/pdf\/browser-pdf"/);
    assert.match(uploadPage, /isPdfUploadFile\(uploadFile\)/);
    assert.match(uploadPage, /extractPdfAfterUploadFailure/);
    assert.doesNotMatch(uploadPage, /import\("@\/lib\/pdf\/browser-pdf"\)/);
    assert.match(uploadPage, /网络上传不稳定，正在本地读取 PDF/);
    assert.match(browserPdf, /extractScheduleFromPdfContent/);
    assert.match(browserPdf, /正在本地读取 PDF 课表/);
  });

  it("times out backend uploads instead of leaving phones stuck reading sources", () => {
    assert.match(uploadPage, /UPLOAD_TIMEOUT_MS\s*=\s*120000/);
    assert.match(uploadPage, /new AbortController\(\)/);
    assert.match(uploadPage, /signal:\s*controller\.signal/);
    assert.match(uploadPage, /读取来源超时/);
  });

  it("keeps server image OCR enabled for deployed phone uploads", () => {
    const imageOcr = readFileSync("src/lib/ocr/image-ocr.ts", "utf8");
    assert.doesNotMatch(imageOcr, /线上图片识别已切换为浏览器端 OCR/);
    assert.doesNotMatch(imageOcr, /process\.env\.VERCEL[\s\S]*CAMPUSFLOW_SERVER_IMAGE_OCR/);
  });

  it("never returns canned OCR samples for PDFs that should be handled by the PDF extractor", () => {
    const ocrStub = readFileSync("src/lib/ocr/paddle-ocr-stub.ts", "utf8");
    assert.doesNotMatch(uploadRoute, /recognize\(buffer,[\s\S]*application\/pdf/);
    assert.doesNotMatch(ocrStub, /EXAM_SAMPLE/);
    assert.match(ocrStub, /PDF 应由 PDF 抽取器处理/);
  });

  it("avoids newer iterable helpers in browser OCR and PDF parsing for older mobile WebViews", () => {
    const directPdf = readFileSync("src/lib/pdf/direct-schedule-extractor.ts", "utf8");
    for (const browserSource of [browserOcr, browserPdf, directPdf]) {
      assert.doesNotMatch(browserSource, /\.flatMap\(/);
      assert.doesNotMatch(browserSource, /\.at\(/);
      assert.doesNotMatch(browserSource, /\.toSorted\(/);
      assert.doesNotMatch(browserSource, /\.findLast\(/);
      assert.doesNotMatch(browserSource, /\.matchAll\(/);
      assert.doesNotMatch(browserSource, /\.\.\.new Uint8Array/);
      assert.doesNotMatch(browserSource, /\.\.\.new Set/);
    }
  });

  it("loads mobile WebView polyfills before upload parsing runs", () => {
    assert.match(rootLayout, /MOBILE_POLYFILL_SCRIPT/);
    assert.match(rootLayout, /campusflow-mobile-polyfills/);
    assert.match(rootLayout, /<head>/);
    assert.match(rootLayout, /next\/script/);
    assert.match(rootLayout, /beforeInteractive/);
    assert.match(uploadPage, /@\/lib\/browser\/mobile-polyfills/);
    assert.match(mobilePolyfills, /Array\.prototype/);
    assert.match(mobilePolyfills, /"at"/);
    assert.match(mobilePolyfills, /"flatMap"/);
    assert.match(mobilePolyfills, /String\.prototype/);
    assert.match(mobilePolyfills, /"replaceAll"/);
    assert.match(buildStaticScript, /injectMobilePolyfills/);
    assert.match(buildStaticScript, /campusflow-mobile-polyfills/);
    assert.match(buildStaticScript, /html\.replace\("<head>"/);
  });

  it("does not require String.matchAll in the mobile local parsing fallback", () => {
    assert.doesNotMatch(localRecognizer, /\.matchAll\(/);
    assert.doesNotMatch(localRecognizer, /\(\?</, "older Safari cannot even parse lookbehind syntax");
  });

  it("ships the legacy PDF.js worker that matches the imported legacy main module", () => {
    const deployedWorker = readFileSync("public/pdfjs/pdf.worker.mjs");
    const legacyWorker = readFileSync("node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
    const modernWorker = readFileSync("node_modules/pdfjs-dist/build/pdf.worker.mjs");
    const hash = (value: Buffer) => createHash("sha256").update(value).digest("hex");

    assert.equal(hash(deployedWorker), hash(legacyWorker));
    assert.notEqual(hash(deployedWorker), hash(modernWorker));
  });

  it("records every Safari PDF.js boundary with actionable failure metadata", () => {
    for (const stage of [
      "dynamic-import-start",
      "dynamic-import-complete",
      "worker-configured",
      "get-document-start",
      "get-document-complete",
      "get-page-start",
      "get-page-complete",
      "get-text-content-start",
      "get-text-content-complete",
    ]) {
      assert.match(browserPdf, new RegExp(stage));
    }
    for (const field of ["errorName", "errorMessage", "errorStack", "pdfjsVersion", "workerVersion", "userAgent", "numPages"]) {
      assert.match(browserPdf, new RegExp(field));
    }
    assert.match(browserPdf, /Safari 本地 PDF 解析失败/);
    assert.match(browserPdf, /失败阶段：\$\{stage\}/);
    assert.match(browserPdf, /错误类型：\$\{errorName\}/);
  });

});
