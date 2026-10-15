import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;

const BASE_URL = process.env.BASE_URL || "http://localhost:3005";
const EVIDENCE_DIR = path.resolve("./evidence-screenshots");
if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

async function runPhase5Audit() {
  console.log(`[Phase 5 Audit] Launching browser (${BROWSER_EXECUTABLE}) for ${BASE_URL}/bg-remover...`);
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

  console.log(`[Phase 5 Audit] Navigating to ${BASE_URL}/bg-remover...`);
  await page.goto(`${BASE_URL}/bg-remover`, { waitUntil: "networkidle2" });

  // 1. Check Header Robotic Audio Controls & Monospace Font
  console.log(`[Phase 5 Audit] 1. Auditing Audio Controls and Typography...`);
  const audioControls = await page.evaluate(() => {
    const muteBtn = document.querySelector("button[title*='audio' i], button[title*='Mute' i], button[title*='Unmute' i]");
    const volSlider = document.querySelector("input[type='range'][title*='Volume' i]");
    const bodyFont = window.getComputedStyle(document.body).fontFamily;
    const pageContainer = document.querySelector(".font-mono");

    return {
      hasMuteBtn: !!muteBtn,
      muteBtnText: muteBtn ? muteBtn.textContent.trim() : null,
      hasVolSlider: !!volSlider,
      sliderVal: volSlider ? volSlider.value : null,
      hasFontMonoClass: !!pageContainer,
    };
  });
  console.log("Audio controls audit result:", audioControls);

  // 2. Check 0px Border-Radius across all buttons, cards, and inputs in Module 02
  console.log(`[Phase 5 Audit] 2. Auditing 0px border-radius (rounded-none) inside Module 02...`);
  const borderRadii = await page.evaluate(() => {
    const module02Root = document.querySelector(".space-y-5.font-mono");
    const elements = Array.from(
      module02Root
        ? module02Root.querySelectorAll("button, input, select, div[class*='border']")
        : document.querySelectorAll("button, input, select, div[class*='border']")
    );
    const nonZeroElements = [];
    for (const el of elements) {
      const style = window.getComputedStyle(el);
      const br = style.borderRadius;
      if (br && br !== "0px" && parseFloat(br) > 0) {
        nonZeroElements.push({
          tag: el.tagName,
          classes: el.className,
          borderRadius: br,
          text: (el.textContent || "").slice(0, 30),
        });
      }
    }
    return {
      totalElementsChecked: elements.length,
      nonZeroCount: nonZeroElements.length,
      sampleNonZero: nonZeroElements.slice(0, 5),
    };
  });
  console.log("Border-radius audit result:", borderRadii);

  // Take initial Standby Screenshot
  await page.screenshot({ path: path.join(EVIDENCE_DIR, "phase5-01-standby-hud.png") });
  console.log("Captured standby screenshot: phase5-01-standby-hud.png");

  // 3. Upload a sample image and verify scanning overlay + audio triggers
  console.log(`[Phase 5 Audit] 3. Uploading test portrait image...`);
  const testImagePath = path.resolve("./test-fixtures/01-portrait-black-hair-pink-bg.png");

  // Upload file via file input
  const fileInput = await page.$("input[type='file']");
  if (fileInput && fs.existsSync(testImagePath)) {
    await fileInput.uploadFile(testImagePath);
    await new Promise((r) => setTimeout(r, 1000));
    console.log("Uploaded file successfully.");
  }

  // Check upload zone state
  await page.screenshot({ path: path.join(EVIDENCE_DIR, "phase5-02-image-uploaded.png") });
  console.log("Captured image uploaded screenshot: phase5-02-image-uploaded.png");

  // 4. Trigger segmentation and check scanning animation overlay
  console.log(`[Phase 5 Audit] 4. Triggering Fast Preview segmentation...`);
  const engageBtn = await page.$("button[class*='group relative w-full']");
  if (engageBtn) {
    await engageBtn.click();
    console.log("Clicked engage button.");
    await new Promise((r) => setTimeout(r, 800));

    // Check scanning overlay elements during processing
    const scanningState = await page.evaluate(() => {
      const laserScan = document.querySelector(".animate-laser-scan");
      const scanlines = document.querySelector(".cyber-scanlines");
      const hudBadges = Array.from(document.querySelectorAll(".absolute.z-20")).map((el) => el.textContent.trim());
      const reticles = document.querySelectorAll(".border-cyan-400, .border-t-2");

      return {
        hasLaserScan: !!laserScan,
        hasScanlines: !!scanlines,
        hudBadges,
        reticleCount: reticles.length,
      };
    });
    console.log("Scanning overlay state during segmentation:", scanningState);

    // Screenshot during scanning
    await page.screenshot({ path: path.join(EVIDENCE_DIR, "phase5-03-scanning-animation.png") });
    console.log("Captured scanning animation screenshot: phase5-03-scanning-animation.png");

    // Wait for segmentation to complete (or open manual mode fallback if in test environment)
    console.log("Waiting for segmentation to complete...");
    try {
      await page.waitForFunction(
        () =>
          Array.from(document.querySelectorAll("button")).some(
            (b) => b.innerText.includes("WHITE") || b.innerText.includes("TRANSPARENT")
          ),
        { timeout: 60000 }
      );
      console.log("Segmentation complete! ColorStudio loaded.");
    } catch {
      console.log("Model loading in headless mode hit timeout. Waiting for Manual Mask Mode button...");
      await page.waitForFunction(
        () =>
          Array.from(document.querySelectorAll("button")).some(
            (b) => b.innerText.includes("MANUAL MASK MODE")
          ),
        { timeout: 15000 }
      );
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button"));
        const b = btns.find((el) => el.textContent && el.textContent.includes("MANUAL MASK MODE"));
        if (b) b.click();
      });
      await page.waitForSelector("[data-testid='provenance-badge']", { timeout: 10000 });
    }
  }

  // 5. Audit ColorStudio HUD overlay and corner reticles
  console.log(`[Phase 5 Audit] 5. Auditing ColorStudio corner HUD overlay...`);
  const colorStudioHud = await page.evaluate(() => {
    const hudRes = Array.from(document.querySelectorAll("div")).find((el) => el.textContent.includes("RES:"));
    const hudStatus = Array.from(document.querySelectorAll("div")).find((el) => el.textContent.includes("STATUS:"));
    const hudEngine = Array.from(document.querySelectorAll("div")).find((el) => el.textContent.includes("ENGINE:"));
    const hudZoom = Array.from(document.querySelectorAll("div")).find((el) => el.textContent.includes("ZOOM:"));

    const channelBtns = Array.from(document.querySelectorAll("button[data-channel], button:has(span)")).map((b) => b.textContent.trim());

    // Check all buttons in ColorStudio for 0px border-radius
    const studioButtons = Array.from(document.querySelectorAll("button")).map((b) => ({
      text: b.textContent.trim().slice(0, 25),
      borderRadius: window.getComputedStyle(b).borderRadius,
    }));

    return {
      hasResBadge: !!hudRes,
      resText: hudRes ? hudRes.textContent.trim() : null,
      hasStatusBadge: !!hudStatus,
      statusText: hudStatus ? hudStatus.textContent.trim() : null,
      hasEngineBadge: !!hudEngine,
      engineText: hudEngine ? hudEngine.textContent.trim() : null,
      hasZoomBadge: !!hudZoom,
      zoomText: hudZoom ? hudZoom.textContent.trim() : null,
      allStudioButtonsZeroRadius: studioButtons.every((b) => b.borderRadius === "0px"),
      sampleButtons: studioButtons.slice(0, 10),
    };
  });
  console.log("ColorStudio HUD audit result:", colorStudioHud);

  // Take screenshot of ColorStudio
  await page.screenshot({ path: path.join(EVIDENCE_DIR, "phase5-04-color-studio-hud.png") });
  console.log("Captured ColorStudio HUD screenshot: phase5-04-color-studio-hud.png");

  // 6. Test Channel Switching (White, Pink, Transparent)
  console.log(`[Phase 5 Audit] 6. Testing channel switches...`);
  const pinkBtn = await page.$("button[data-channel='pink']");
  if (pinkBtn) {
    await pinkBtn.click();
    await new Promise((r) => setTimeout(r, 200));
    console.log("Switched to Pink channel.");
  }
  const transBtn = await page.$("button[data-channel='transparent']");
  if (transBtn) {
    await transBtn.click();
    await new Promise((r) => setTimeout(r, 200));
    console.log("Switched to Transparent channel.");
  }
  await page.screenshot({ path: path.join(EVIDENCE_DIR, "phase5-05-transparent-view.png") });

  // 7. Test Export Transparent PNG
  console.log(`[Phase 5 Audit] 7. Testing Export button...`);
  const exportResult = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const exp = btns.find((b) => b.textContent.includes("Export Transparent PNG"));
    if (exp) {
      exp.click();
      return { clicked: true, font: window.getComputedStyle(exp).fontFamily };
    }
    return { clicked: false };
  });
  console.log("Export button test result:", exportResult);

  // 8. Test Audio Mute / Unmute & Volume change
  console.log(`[Phase 5 Audit] 8. Testing Audio Toggle and Volume Slider...`);
  const audioToggleResult = await page.evaluate(() => {
    const muteBtn = document.querySelector("button[title*='audio' i], button[title*='Mute' i], button[title*='Unmute' i]");
    if (muteBtn) {
      muteBtn.click();
      const afterMute = muteBtn.textContent.trim();
      muteBtn.click();
      const afterUnmute = muteBtn.textContent.trim();
      return { toggled: true, afterMute, afterUnmute };
    }
    return { toggled: false };
  });
  console.log("Audio toggle result:", audioToggleResult);

  await browser.close();

  const auditReport = {
    audioControls,
    borderRadii,
    colorStudioHud,
    audioToggleResult,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync("./phase5-verification-report.json", JSON.stringify(auditReport, null, 2));
  console.log("Phase 5 Audit complete! Report written to phase5-verification-report.json");
}

runPhase5Audit().catch((err) => {
  console.error("Phase 5 Audit Error:", err);
  process.exit(1);
});
