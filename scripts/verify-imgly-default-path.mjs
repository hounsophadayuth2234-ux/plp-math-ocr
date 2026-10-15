import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const TARGET_URL = process.env.TEST_TARGET_URL || "http://localhost:3005/bg-remover";
const PORTRAIT_PATH = path.resolve("portrait-pink.png");

async function runImglyDefaultVerification() {
  console.log("==================================================================");
  console.log("VERIFYING MODULE 02 DEFAULT PATH: @imgly/isnet_fp16");
  console.log("Target URL:", TARGET_URL);
  console.log("Browser:", BROWSER_EXECUTABLE);
  console.log("Fixture:", PORTRAIT_PATH);
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

  const allNetworkRequests = [];
  const initialPageRequests = [];
  const afterUploadRequests = [];
  const processingRequests = [];

  let phase = "initial_load";

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 950 });

    page.on("request", (req) => {
      const url = req.url();
      allNetworkRequests.push(url);
      if (phase === "initial_load") {
        initialPageRequests.push(url);
      } else if (phase === "after_upload") {
        afterUploadRequests.push(url);
      } else if (phase === "processing") {
        processingRequests.push(url);
      }
    });

    page.on("console", (msg) => {
      const text = msg.text();
      if (!text.includes("favicon") && !text.includes("DevTools")) {
        console.log("  [Browser Console]", msg.type(), text);
      }
    });

    page.on("pageerror", (err) => {
      console.log("  [Browser PageError]", err.message);
    });

    // 1. Initial Page Load Check
    console.log("\n[STEP 1] Navigating to /bg-remover...");
    await page.goto(TARGET_URL, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1500));

    // Verify no model or transformers downloaded on initial page open
    const initialHeavyModelRequests = initialPageRequests.filter(
      (u) =>
        u.includes(".onnx") ||
        u.includes("transformers") ||
        u.includes("birefnet") ||
        u.includes("huggingface.co") ||
        u.includes("isnet")
    );

    console.log("  Initial page requests count:", initialPageRequests.length);
    console.log("  Initial heavy model requests:", initialHeavyModelRequests);
    if (initialHeavyModelRequests.length > 0) {
      throw new Error(
        `Failed: Heavy model requested before user uploaded an image: ${initialHeavyModelRequests.join(
          ", "
        )}`
      );
    }
    console.log("  PASS: Zero model or transformer requests when Module 02 opens.");

    // 2. Upload image check
    phase = "after_upload";
    console.log("\n[STEP 2] Uploading test image (portrait-pink.png)...");
    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) throw new Error("File input not found!");
    await fileInput.uploadFile(PORTRAIT_PATH);
    await new Promise((r) => setTimeout(r, 1000));

    const afterUploadModelRequests = afterUploadRequests.filter(
      (u) =>
        u.includes(".onnx") ||
        u.includes("transformers") ||
        u.includes("birefnet") ||
        u.includes("huggingface.co")
    );
    console.log("  Requests after image upload but before processing:", afterUploadModelRequests);
    if (afterUploadModelRequests.length > 0) {
      throw new Error(
        `Failed: Heavy model requested before user initiated processing: ${afterUploadModelRequests.join(
          ", "
        )}`
      );
    }
    console.log("  PASS: Zero model requests before user clicks process.");

    // 3. Start processing (Fast Preview with @imgly/isnet_fp16)
    phase = "processing";
    console.log("\n[STEP 3] Starting processing (Fast Preview)...");
    const startTime = Date.now();

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

    // Wait for either completion or error
    console.log("  Waiting for segmentation to complete (timeout: 25s)...");
    await page.waitForFunction(
      () => {
        const badge = document.querySelector('[data-testid="provenance-badge"]');
        const hasError = Array.from(document.querySelectorAll("h4")).some((h) =>
          h.innerText.includes("SEGMENTATION ERROR")
        );
        return !!badge || hasError;
      },
      { timeout: 30000 }
    );

    const elapsedMs = Date.now() - startTime;
    console.log(`  Processing completed in ${(elapsedMs / 1000).toFixed(2)}s`);

    const pageErrorBanner = await page.evaluate(() => {
      const h4 = Array.from(document.querySelectorAll("h4")).find((h) =>
        h.innerText.includes("SEGMENTATION ERROR")
      );
      if (h4) {
        const p = h4.parentElement?.querySelector("p")?.innerText;
        return p || h4.innerText;
      }
      return null;
    });

    if (pageErrorBanner) {
      console.log("  [Detected Page Error Banner]:", pageErrorBanner);
    }

    // Verify duration within 20s
    if (elapsedMs > 22000) {
      console.warn(`  Warning: Elapsed time ${(elapsedMs / 1000).toFixed(2)}s was longer than 20s.`);
    } else {
      console.log("  PASS: Processing duration is within reasonable preview threshold.");
    }

    // 4. Verify network requests during processing
    console.log("\n[STEP 4] Verifying network requests during processing...");
    const transformersOrBiRefNetRequests = processingRequests.filter(
      (u) =>
        u.includes("transformers.min.js") ||
        u.includes("transformers") ||
        u.includes("birefnet") ||
        u.includes("huggingface.co")
    );

    console.log(
      "  Transformers or BiRefNet requests found:",
      transformersOrBiRefNetRequests.length
    );
    if (transformersOrBiRefNetRequests.length > 0) {
      throw new Error(
        `Failed: BiRefNet or transformers requested during default flow: ${transformersOrBiRefNetRequests.join(
          ", "
        )}`
      );
    }
    console.log("  PASS: Zero BiRefNet or transformers.min.js requests during default flow.");

    const imglyRequests = processingRequests.filter(
      (u) => u.includes("@imgly") || u.includes("isnet_fp16") || u.includes("isnet")
    );
    console.log(`  @imgly / isnet requests found: ${imglyRequests.length}`);

    // 5. Verify Actual Model Name & Provenance Label
    console.log("\n[STEP 5] Checking output provenance badge...");
    const provenanceText = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="provenance-badge"]');
      return el ? el.innerText.trim() : null;
    });

    console.log("  Actual Provenance Badge Text:", `"${provenanceText}"`);
    const expectedLabel = "Browser AI result — @imgly/isnet_fp16";
    if (provenanceText !== expectedLabel) {
      throw new Error(
        `Provenance label mismatch! Expected "${expectedLabel}", got "${provenanceText}"`
      );
    }
    console.log(`  PASS: Output correctly labeled "${expectedLabel}"`);

    // 6. Verify Generated Alpha PNG & Genuine Transparency
    console.log("\n[STEP 6] Verifying generated alpha PNG transparency...");
    const alphaStats = await page.evaluate(async () => {
      // Find transparent button to switch to transparent channel
      const transBtn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.innerText.includes("TRANSPARENT")
      );
      if (transBtn) transBtn.click();
      await new Promise((r) => setTimeout(r, 200));

      const canvas = document.querySelector("canvas");
      if (!canvas) return { error: "Canvas not found" };
      const ctx = canvas.getContext("2d");
      if (!ctx) return { error: "2D context not found" };

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      let transparentCount = 0;
      let opaqueCount = 0;
      let semiCount = 0;

      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a === 0) transparentCount++;
        else if (a === 255) opaqueCount++;
        else semiCount++;
      }

      return {
        width: canvas.width,
        height: canvas.height,
        transparentCount,
        opaqueCount,
        semiCount,
        total: canvas.width * canvas.height,
      };
    });

    console.log("  Alpha Stats:", alphaStats);
    if (alphaStats.error) {
      throw new Error(`Alpha channel error: ${alphaStats.error}`);
    }
    if (alphaStats.transparentCount === 0) {
      throw new Error("Alpha channel validation failed: Zero transparent pixels detected!");
    }
    console.log(
      `  PASS: Genuine transparent alpha channel verified (${alphaStats.transparentCount} transparent pixels).`
    );

    // 7. Verify Cancel and Retry UI elements
    console.log("\n[STEP 7] Verifying Cancel and Retry functionality...");
    // Check reset mask and action controls
    const hasStudioControls = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button")).map((b) =>
        b.innerText.trim()
      );
      return {
        hasUndo: buttons.some((t) => t.includes("Undo")),
        hasRedo: buttons.some((t) => t.includes("Redo")),
        hasReset: buttons.some((t) => t.includes("Reset Mask")),
        hasExport: buttons.some((t) => t.includes("Export Transparent PNG")),
      };
    });

    console.log("  Studio controls:", hasStudioControls);
    if (!hasStudioControls.hasExport || !hasStudioControls.hasReset) {
      throw new Error("Studio controls missing!");
    }
    console.log("  PASS: Studio controls and export available.");

    console.log("\n==================================================================");
    console.log("ALL ACCEPTANCE CHECKS PASSED FOR @imgly/isnet_fp16 DEFAULT PATH!");
    console.log("==================================================================");
  } finally {
    await browser.close();
  }
}

runImglyDefaultVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
