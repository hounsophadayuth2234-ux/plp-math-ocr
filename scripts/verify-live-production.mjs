import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PROD_BASE_URL = "https://ai-toolkit-hub-nu.vercel.app";
const SCREENSHOTS_DIR = path.resolve(process.cwd(), "evidence-screenshots");
const ARTIFACTS_DIR = "C:\\Users\\User\\.gemini\\antigravity\\brain\\cab44b73-5dfa-478c-82c2-30ae8ad3f7c0";

if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

async function main() {
  console.log("=== STARTING LIVE PRODUCTION VERIFICATION ===");
  const results = {
    settingsEndpoint: null,
    healthEndpoint: null,
    removeBgPost: null,
    bgRemoverUi: null,
    mathOcrUntouched: null,
    timestamp: new Date().toISOString(),
  };

  // 1. Verify GET /api/settings
  console.log("\n1. Testing GET /api/settings...");
  const settingsRes = await fetch(`${PROD_BASE_URL}/api/settings`);
  const settingsData = await settingsRes.json();
  console.log("Settings Response:", JSON.stringify(settingsData, null, 2));

  if (!settingsData.rembgSpaceUrlSet || !settingsData.backgroundRemovalWorkerConfigured) {
    throw new Error("Settings endpoint failed: Worker not reported as configured!");
  }
  if (!settingsData.rembgSpaceUrl.includes("...")) {
    throw new Error("Settings endpoint failed: URL is not masked!");
  }
  results.settingsEndpoint = {
    status: settingsRes.status,
    rembgSpaceUrlSet: settingsData.rembgSpaceUrlSet,
    rembgSpaceUrl: settingsData.rembgSpaceUrl,
    backgroundRemovalWorkerConfigured: settingsData.backgroundRemovalWorkerConfigured,
    backgroundRemovalWorkerStatus: settingsData.backgroundRemovalWorkerStatus,
  };

  // 2. Verify GET /api/remove-bg?checkHealth=true
  console.log("\n2. Testing GET /api/remove-bg?checkHealth=true...");
  const healthRes = await fetch(`${PROD_BASE_URL}/api/remove-bg?checkHealth=true`);
  const healthData = await healthRes.json();
  console.log("Health Response:", JSON.stringify(healthData, null, 2));

  if (!healthData.configured || healthData.status !== "ready") {
    throw new Error(`Health check failed: status=${healthData.status}`);
  }
  results.healthEndpoint = healthData;

  // 3. Verify POST /api/remove-bg with real fixture
  console.log("\n3. Testing direct curl/fetch POST /api/remove-bg with fixture-1200x1200.jpg...");
  const fixturePath = path.resolve(process.cwd(), "test-fixtures/fixture-1200x1200.jpg");
  const fileBytes = fs.readFileSync(fixturePath);
  const formData = new FormData();
  formData.append("image", new Blob([fileBytes], { type: "image/jpeg" }), "fixture-1200x1200.jpg");

  const startTime = Date.now();
  const removeRes = await fetch(`${PROD_BASE_URL}/api/remove-bg`, {
    method: "POST",
    body: formData,
  });
  const elapsedMs = Date.now() - startTime;
  console.log(`Remove POST status: ${removeRes.status} in ${elapsedMs}ms`);

  if (!removeRes.ok) {
    const errorText = await removeRes.text();
    throw new Error(`Remove POST failed (${removeRes.status}): ${errorText}`);
  }

  const contentType = removeRes.headers.get("content-type");
  const procSource = removeRes.headers.get("x-processing-source");
  const segModel = removeRes.headers.get("x-segmentation-model");
  const arrayBuf = await removeRes.arrayBuffer();
  const resBuf = Buffer.from(arrayBuf);

  console.log("Response Content-Type:", contentType);
  console.log("X-Processing-Source:", procSource);
  console.log("X-Segmentation-Model:", segModel);
  console.log("Response Byte Length:", resBuf.length);

  const isPng = resBuf[0] === 0x89 && resBuf[1] === 0x50 && resBuf[2] === 0x4E && resBuf[3] === 0x47;
  if (!isPng || resBuf.length < 5000) {
    throw new Error("Response is not a valid PNG image or too small!");
  }

  results.removeBgPost = {
    status: removeRes.status,
    contentType,
    processingSource: procSource,
    segmentationModel: segModel,
    bytes: resBuf.length,
    elapsedMs,
    validPng: isPng,
  };

  // 4. Puppeteer UI verification on live production
  console.log("\n4. Launching Chrome for live UI verification...");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });

    page.on("console", (msg) => console.log(`[Browser ${msg.type()}]:`, msg.text()));
    page.on("requestfailed", (req) => console.log(`[Request Failed]: ${req.method()} ${req.url()}`));

    console.log(`Navigating to ${PROD_BASE_URL}/bg-remover...`);
    await page.goto(`${PROD_BASE_URL}/bg-remover`, { waitUntil: "networkidle0" });

    // Wait for engine switcher to resolve worker status
    await page.waitForSelector('[data-testid="engine-select-worker"]', { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 2000));

    // Check worker badge status text inside the button
    const workerBadgeText = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="engine-select-worker"]');
      return el ? el.innerText.trim() : null;
    });
    console.log("Worker Radio Text content:\n", workerBadgeText);

    // Save Standby Screenshot
    const standbyPath = path.join(SCREENSHOTS_DIR, "live-prod-remote-worker-standby.png");
    await page.screenshot({ path: standbyPath });
    fs.copyFileSync(standbyPath, path.join(ARTIFACTS_DIR, "live-prod-remote-worker-standby.png"));
    console.log("Captured: live-prod-remote-worker-standby.png");

    // Click Remote Worker engine option
    console.log("Clicking Remote Worker option...");
    await page.click('[data-testid="engine-select-worker"]');
    await new Promise((r) => setTimeout(r, 800));

    // Upload image
    console.log("Uploading test fixture image...");
    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) throw new Error("File input not found on /bg-remover");
    await fileInput.uploadFile(fixturePath);
    await new Promise((r) => setTimeout(r, 1500));

    // Save Uploaded Screenshot with Remote Worker selected
    const uploadedPath = path.join(SCREENSHOTS_DIR, "live-prod-remote-worker-uploaded.png");
    await page.screenshot({ path: uploadedPath });
    fs.copyFileSync(uploadedPath, path.join(ARTIFACTS_DIR, "live-prod-remote-worker-uploaded.png"));
    console.log("Captured: live-prod-remote-worker-uploaded.png");

    // Trigger Remote Worker action button
    console.log("Looking for [data-testid='run-remote-worker-btn']...");
    await page.waitForSelector('[data-testid="run-remote-worker-btn"]:not([disabled])', { timeout: 10000 });
    console.log("Clicking [data-testid='run-remote-worker-btn']...");
    await page.click('[data-testid="run-remote-worker-btn"]');

    // Wait for result preview (ColorStudio with provenance badge)
    console.log("Waiting for ColorStudio to render with result...");
    await page.waitForSelector('[data-testid="provenance-badge"]', { timeout: 45000 });
    console.log("ColorStudio rendered successfully!");

    await new Promise((r) => setTimeout(r, 2000));

    const provenanceText = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="provenance-badge"]');
      return el ? el.textContent.trim() : null;
    });
    console.log("Provenance Badge Text:", provenanceText);

    // Save Result Screenshot
    const resultPath = path.join(SCREENSHOTS_DIR, "live-prod-remote-worker-result.png");
    await page.screenshot({ path: resultPath });
    fs.copyFileSync(resultPath, path.join(ARTIFACTS_DIR, "live-prod-remote-worker-result.png"));
    console.log("Captured: live-prod-remote-worker-result.png");

    results.bgRemoverUi = {
      badgeText: workerBadgeText,
      provenanceText,
      screenshots: [
        "live-prod-remote-worker-standby.png",
        "live-prod-remote-worker-uploaded.png",
        "live-prod-remote-worker-result.png",
      ],
      success: true,
    };

    // 5. Verify Module 01 (Math OCR) Untouched
    console.log(`\n5. Verifying Module 01 at ${PROD_BASE_URL}/math-ocr...`);
    const mathErrors = [];
    page.on("pageerror", (err) => mathErrors.push(err.message));

    await page.goto(`${PROD_BASE_URL}/math-ocr`, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 1500));

    const mathOcrTitle = await page.evaluate(() => {
      const h1 = document.querySelector("h1");
      return h1 ? h1.textContent.trim() : null;
    });

    const mathOcrUploadZone = (await page.$('[data-testid="image-upload-zone"]')) || (await page.$('input[type="file"]'));
    const mathOcrPath = path.join(SCREENSHOTS_DIR, "live-prod-module01-untouched.png");
    await page.screenshot({ path: mathOcrPath });
    fs.copyFileSync(mathOcrPath, path.join(ARTIFACTS_DIR, "live-prod-module01-untouched.png"));
    console.log("Captured: live-prod-module01-untouched.png");

    results.mathOcrUntouched = {
      title: mathOcrTitle,
      hasUploadZone: Boolean(mathOcrUploadZone),
      pageErrors: mathErrors,
      screenshot: "live-prod-module01-untouched.png",
      healthy: mathErrors.length === 0,
    };
  } finally {
    await browser.close();
  }

  // Write final evidence report JSON
  fs.writeFileSync(
    path.resolve(process.cwd(), "live-production-verification.json"),
    JSON.stringify(results, null, 2)
  );
  console.log("\n=== ALL LIVE PRODUCTION VERIFICATIONS COMPLETED SUCCESSFULLY ===");
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error("FATAL ERROR during live production verification:", err);
  process.exit(1);
});
