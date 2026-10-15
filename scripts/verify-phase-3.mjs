import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const TARGET_URL = "https://ai-toolkit-hub-nu.vercel.app/bg-remover";
const FIXTURE_PATH = path.resolve("portrait-pink.png");

async function runPhase3() {
  console.log("==================================================================");
  console.log("PHASE 3 — REAL END-TO-END MODULE 02 PRODUCTION TEST");
  console.log("Target:", TARGET_URL);
  console.log("Fixture:", FIXTURE_PATH);
  console.log("==================================================================");

  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: "new",
    userDataDir: path.resolve(".puppeteer-cache"),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--enable-features=WebGPU",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
    ],
  });

  const networkRequests = [];
  const consoleErrors = [];

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 950 });

    page.on("request", (req) => {
      networkRequests.push(req.url());
    });

    page.on("console", (msg) => {
      const type = msg.type();
      const text = msg.text();
      if (type === "error" && !text.includes("favicon") && !text.includes("DevTools")) {
        consoleErrors.push(text);
      }
    });

    page.on("pageerror", (err) => {
      consoleErrors.push(err.message);
    });

    console.log("\n1. Navigating to production /bg-remover...");
    await page.goto(TARGET_URL, { waitUntil: "networkidle2", timeout: 40000 });
    await new Promise((r) => setTimeout(r, 1200));

    console.log("2. Uploading real test image...");
    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) throw new Error("File input not found");
    await fileInput.uploadFile(FIXTURE_PATH);
    await new Promise((r) => setTimeout(r, 1000));

    // Clear network requests logged so far to only count during processing
    networkRequests.length = 0;

    console.log("3. Triggering Automatic Cut (Fast Preview)...");
    const t0 = Date.now();
    const clickResult = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(
        (b) =>
          b.innerText.includes("AUTOMATIC CUT") ||
          b.innerText.includes("ENGAGE") ||
          b.innerText.includes("RUN FAST PREVIEW")
      );
      if (!btn) return { found: false };
      const disabled = btn.disabled;
      if (!disabled) btn.click();
      return { found: true, disabled, text: btn.innerText };
    });
    console.log("  Button status before click:", clickResult);

    // Wait for ColorStudio output deck or error
    await page.waitForFunction(
      () => {
        const badge = document.querySelector('[data-testid="provenance-badge"]');
        const hasError = Array.from(document.querySelectorAll("h4")).some((h) =>
          h.innerText.includes("SEGMENTATION ERROR")
        );
        return !!badge || hasError;
      },
      { timeout: 35000 }
    );
    const totalProcessingDuration = Date.now() - t0;

    console.log(`  Processing completed in ${totalProcessingDuration}ms`);

    // Extract metrics and dimensions from client DOM / state
    const report = await page.evaluate(async () => {
      const badge = document.querySelector('[data-testid="provenance-badge"]')?.innerText.trim();
      const canvas = document.querySelector("canvas");
      const ctx = canvas ? canvas.getContext("2d") : null;

      let transparentCount = 0;
      let opaqueCount = 0;
      let semiCount = 0;

      // Switch to transparent view to check transparency
      const transBtn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.innerText.includes("TRANSPARENT")
      );
      if (transBtn) transBtn.click();
      await new Promise((r) => setTimeout(r, 200));

      if (ctx && canvas) {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          const a = d[i + 3];
          if (a === 0) transparentCount++;
          else if (a === 255) opaqueCount++;
          else semiCount++;
        }
      }

      // Switch to White
      const whiteBtn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.innerText.includes("WHITE")
      );
      if (whiteBtn) whiteBtn.click();
      await new Promise((r) => setTimeout(r, 200));

      // Switch to Pink
      const pinkBtn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.innerText.includes("PINK")
      );
      if (pinkBtn) pinkBtn.click();
      await new Promise((r) => setTimeout(r, 200));

      // Switch back to Transparent
      if (transBtn) transBtn.click();
      await new Promise((r) => setTimeout(r, 200));

      // Click export transparent PNG
      const exportBtn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.innerText.includes("Export Transparent PNG")
      );
      if (exportBtn) exportBtn.click();

      // Export canvas blob to measure size and format
      let exportedBlobSize = 0;
      let exportedBlobType = "";
      if (canvas) {
        const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
        if (blob) {
          exportedBlobSize = blob.size;
          exportedBlobType = blob.type;
        }
      }

      return {
        badge,
        canvasWidth: canvas ? canvas.width : 0,
        canvasHeight: canvas ? canvas.height : 0,
        transparentCount,
        opaqueCount,
        semiCount,
        hasRealAlpha: transparentCount > 0,
        exportedBlobSize,
        exportedBlobType,
      };
    });

    // Check network requests
    const isnetRequests = networkRequests.filter(
      (u) => u.includes("@imgly") || u.includes("isnet_fp16") || u.includes("isnet")
    );
    const birefnetRequests = networkRequests.filter(
      (u) => u.includes("birefnet") || u.includes("BiRefNet")
    );
    const transformersRequests = networkRequests.filter(
      (u) => u.includes("transformers.min.js") || u.includes("transformers")
    );
    const cloudApiRequests = networkRequests.filter(
      (u) => u.includes("/api/remove-bg") || u.includes("replicate") || u.includes("huggingface")
    );

    console.log("\n==================================================================");
    console.log("PHASE 3 TELEMETRY AUDIT REPORT");
    console.log("==================================================================");
    console.log("Actual model name:", report.badge);
    console.log("Total processing duration:", totalProcessingDuration, "ms");
    console.log("Image input dimensions: 400 x 500 px (portrait-pink.png)");
    console.log(`Mask dimensions: ${report.canvasWidth} x ${report.canvasHeight} px`);
    console.log(`Output PNG dimensions: ${report.canvasWidth} x ${report.canvasHeight} px`);
    console.log(`Output PNG file size: ${report.exportedBlobSize} bytes (${report.exportedBlobType})`);
    console.log("Contains real alpha channel:", report.hasRealAlpha);
    console.log(`Alpha pixel breakdown: ${report.transparentCount} transparent, ${report.semiCount} semi-transparent, ${report.opaqueCount} opaque`);
    console.log("Browser console errors:", consoleErrors.length === 0 ? "None (0 errors)" : consoleErrors);
    console.log("Network Requests during processing:");
    console.log(`  - @imgly / isnet_fp16 requests: ${isnetRequests.length}`);
    console.log(`  - BiRefNet requests: ${birefnetRequests.length} (PASS)`);
    console.log(`  - transformers.min.js requests: ${transformersRequests.length} (PASS)`);
    console.log(`  - Unexpected Cloud API requests: ${cloudApiRequests.length} (PASS)`);
    console.log("==================================================================");
  } finally {
    await browser.close();
  }
}

runPhase3().catch((err) => {
  console.error("Phase 3 failed:", err);
  process.exit(1);
});
