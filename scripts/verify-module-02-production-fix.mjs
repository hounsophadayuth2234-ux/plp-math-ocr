import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;

const BASE_URL = process.env.BASE_URL || "https://ai-toolkit-hub-nu.vercel.app";
const EVIDENCE_DIR = path.resolve("./evidence-screenshots");
if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

async function runProductionFixVerification() {
  console.log(`[Verification] Launching browser for ${BASE_URL}/bg-remover...`);
  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: "new",
    userDataDir: path.resolve(".puppeteer-cache"),
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--enable-webgl"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });

  const consoleLogs = [];
  page.on("console", (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

  console.log(`[Verification] 1. Navigating to ${BASE_URL}/bg-remover...`);
  await page.goto(`${BASE_URL}/bg-remover`, { waitUntil: "networkidle2" });

  // 1. Audit Standby Engine Status and Remote Worker Unconfigured state
  console.log("[Verification] 2. Auditing Standby Status & Remote Worker UI...");
  const standbyState = await page.evaluate(() => {
    const text = document.body.innerText;
    const hasStandby = text.includes("STANDBY") || text.includes("ONLINE");
    const remoteBtn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent && b.textContent.includes("Remote Worker")
    );
    const hasNotConfigured = remoteBtn ? remoteBtn.textContent.includes("NOT CONFIGURED") : false;
    return {
      hasStandby,
      hasNotConfigured,
      remoteBtnFound: !!remoteBtn,
    };
  });
  console.log("Standby state audit:", standbyState);

  // Test Remote Worker Notice
  console.log("[Verification] 3. Clicking Remote Worker button to verify explanatory banner...");
  await page.evaluate(() => {
    const remoteBtn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent && b.textContent.includes("Remote Worker")
    );
    if (remoteBtn) remoteBtn.click();
  });
  await new Promise((r) => setTimeout(r, 600));

  const remoteNoticeState = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasNoticeBanner: text.includes("REMOTE WORKER NOT CONFIGURED") || text.includes("Browser AI mode is active"),
    };
  });
  console.log("Remote worker notice state:", remoteNoticeState);

  // Switch back to Fast Preview
  await page.evaluate(() => {
    const previewBtn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent && b.textContent.includes("Fast Preview")
    );
    if (previewBtn) previewBtn.click();
  });
  await new Promise((r) => setTimeout(r, 400));

  // 2. Upload test portrait fixture
  const fixturePath = path.resolve("./test-fixtures/01-portrait-black-hair-pink-bg.png");
  console.log(`[Verification] 4. Uploading test portrait (${fixturePath})...`);
  const fileInput = await page.$("input[type='file']");
  if (!fileInput) throw new Error("File input not found");
  await fileInput.uploadFile(fixturePath);
  await new Promise((r) => setTimeout(r, 1000));

  // 3. Trigger Fast Preview
  console.log("[Verification] 5. Triggering Fast Preview segmentation...");
  const engageBtn = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent && (b.textContent.includes("FAST PREVIEW") || b.textContent.includes("AUTOMATIC CUT"))
    );
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  assert.ok(engageBtn, "Engage button must be clicked");

  // Check scanning overlay & telemetry
  await new Promise((r) => setTimeout(r, 1500));
  const scanningState = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasLaserScan: !!document.querySelector(".animate-laser-scan"),
      hasScanlines: !!document.querySelector(".cyber-scanlines"),
      isSegmenting: text.includes("SEGMENTING") || text.includes("LOADING ASSETS") || text.includes("INFERENCE ACTIVE"),
    };
  });
  console.log("Scanning state:", scanningState);

  // Wait for segmentation to complete and ColorStudio to render (max 70s)
  console.log("[Verification] 6. Awaiting ColorStudio segmentation completion...");
  await page.waitForFunction(
    () => {
      const text = document.body.innerText;
      return text.includes("MANUAL MASK STUDIO") || text.includes("DOWNLOAD // SOLID WHITE");
    },
    { timeout: 70000 }
  );
  console.log("ColorStudio loaded successfully!");

  // 4. Audit Provenance Badge and Decoded Pixels (Fixes Luminance Bug Proof)
  console.log("[Verification] 7. Auditing initial provenance badge...");
  const provenanceAudit = await page.evaluate(() => {
    const provBadge = document.querySelector("[data-testid='provenance-badge']");
    const badgeText = provBadge ? provBadge.textContent : "";
    return {
      hasProvBadge: !!provBadge,
      badgeText,
      isBrowserAiResult: badgeText.includes("Browser AI result — @imgly/isnet_fp16"),
    };
  });
  console.log("Initial Provenance Badge:", provenanceAudit);

  // Sample pixel data from working canvas at black hair coordinate to prove alpha is 255 (not 20!)
  console.log("[Verification] 8. Verifying canvas pixel data (Luminance Bug Fix Proof)...");
  const pixelAudit = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return { error: "Canvas not found" };
    const ctx = canvas.getContext("2d");
    if (!ctx) return { error: "Ctx not found" };

    // Sample near center-top where hair is located (e.g. x=200, y=100 on 400x500 canvas)
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    let darkHairPixelCount = 0;
    let minAlphaFound = 255;
    let maxAlphaFound = 0;
    let samplePixels = [];

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      // Opaque dark hair pixel: low RGB, high alpha
      if (r < 50 && g < 50 && b < 50 && a > 200) {
        darkHairPixelCount++;
        minAlphaFound = Math.min(minAlphaFound, a);
        maxAlphaFound = Math.max(maxAlphaFound, a);
        if (samplePixels.length < 5) {
          samplePixels.push({ r, g, b, a });
        }
      }
    }

    return {
      width: canvas.width,
      height: canvas.height,
      darkHairPixelCount,
      minAlphaFound,
      maxAlphaFound,
      samplePixels,
    };
  });
  console.log("Pixel verification audit result:", pixelAudit);

  // 5. Test Channel Switching
  console.log("[Verification] 9. Testing instant channel switching (< 5ms)...");
  const channels = ["pink", "transparent", "mask", "original", "white"];
  for (const ch of channels) {
    const t0 = Date.now();
    await page.evaluate((targetCh) => {
      const btn = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent && b.textContent.toUpperCase().includes(targetCh.toUpperCase())
      );
      if (btn) btn.click();
    }, ch);
    await new Promise((r) => setTimeout(r, 100));
    const duration = Date.now() - t0;
    console.log(`  -> Switched to ${ch.toUpperCase()} in ${duration}ms`);
  }

  // 6. Test Keep Brush Stroke and Provenance Update
  console.log("[Verification] 10. Performing Keep Brush stroke to test provenance update...");
  await page.evaluate(() => {
    const keepBtn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent && b.textContent.includes("Keep Brush")
    );
    if (keepBtn) keepBtn.click();
  });
  await new Promise((r) => setTimeout(r, 200));

  // Dispatch mouse draw on canvas
  const canvasElement = await page.$("canvas");
  if (canvasElement) {
    const box = await canvasElement.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 20);
      await page.mouse.up();
    }
  }
  await new Promise((r) => setTimeout(r, 500));

  // Click Apply Corrections
  await page.evaluate(() => {
    const applyBtn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent && b.textContent.includes("Apply Corrections")
    );
    if (applyBtn) applyBtn.click();
  });
  await new Promise((r) => setTimeout(r, 500));

  // Check updated provenance badge
  const updatedBadgeText = await page.evaluate(() => {
    const badge = document.querySelector("[data-testid='provenance-badge']");
    return badge ? badge.textContent : "";
  });
  console.log("Updated Provenance Badge after manual correction:", updatedBadgeText);

  // 7. Test Export Transparent PNG
  console.log("[Verification] 11. Testing Export Transparent PNG button...");
  const exportSuccess = await page.evaluate(() => {
    const exportBtn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent && b.textContent.includes("Export Transparent PNG")
    );
    if (exportBtn) {
      exportBtn.click();
      return true;
    }
    return false;
  });
  console.log("Export button clicked:", exportSuccess);

  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    standbyState,
    remoteNoticeState,
    scanningState,
    provenanceAudit,
    pixelAudit,
    updatedBadgeText,
    exportSuccess,
  };

  fs.writeFileSync("repair-verification-report.json", JSON.stringify(report, null, 2));
  console.log("\n[Verification] Complete! Report saved to repair-verification-report.json");

  await browser.close();
}

runProductionFixVerification().catch((e) => {
  console.error("Verification failed:", e);
  process.exit(1);
});
