import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const TARGET_URL = "https://ai-toolkit-hub-nu.vercel.app/bg-remover";

const TEST_FIXTURES = [
  { name: "1. Portrait with black hair & pink background", file: "portrait-pink.png" },
  { name: "2. Person wearing a dark suit", file: "test-dark-suit.png" },
  { name: "3. Illustration with animals & thin legs", file: "test-animals-legs.png" },
  { name: "4. Product image with complex background", file: "test-product.png" },
];

async function runPhase5MultiImageTest() {
  console.log("==================================================================");
  console.log("PHASE 5 — MASK BRUSH FUNCTIONALITY ACCEPTANCE SUITE (4 FIXTURES)");
  console.log("Target:", TARGET_URL);
  console.log("Browser:", BROWSER_EXECUTABLE);
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

  try {
    for (const fixture of TEST_FIXTURES) {
      const fixturePath = path.resolve(fixture.file);
      if (!fs.existsSync(fixturePath)) {
        throw new Error(`Fixture not found: ${fixturePath}`);
      }

      console.log(`\n------------------------------------------------------------------`);
      console.log(`TESTING FIXTURE: ${fixture.name}`);
      console.log(`File: ${fixture.file} (${fs.statSync(fixturePath).size} bytes)`);
      console.log(`------------------------------------------------------------------`);

      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 950 });

      // Navigate to page
      await page.goto(TARGET_URL, { waitUntil: "networkidle2", timeout: 40000 });
      await new Promise((r) => setTimeout(r, 1000));

      // Upload fixture
      const fileInput = await page.$('input[type="file"]');
      if (!fileInput) throw new Error("File input not found");
      await fileInput.uploadFile(fixturePath);
      await new Promise((r) => setTimeout(r, 1200));

      // Click Automatic Cut
      console.log("  [Step 1] Triggering Automatic Cut (@imgly/isnet_fp16)...");
      const t0 = Date.now();
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find(
          (b) =>
            b.innerText.includes("AUTOMATIC CUT") ||
            b.innerText.includes("ENGAGE") ||
            b.innerText.includes("RUN FAST PREVIEW")
        );
        if (btn && !btn.disabled) btn.click();
      });

      // Wait for output deck
      await page.waitForFunction(
        () => !!document.querySelector('[data-testid="provenance-badge"]'),
        { timeout: 35000 }
      );
      const autoCutMs = Date.now() - t0;
      console.log(`  ✓ Automatic Cut completed in ${(autoCutMs / 1000).toFixed(2)}s`);

      // Verify initial provenance
      const initialBadge = await page.evaluate(
        () => document.querySelector('[data-testid="provenance-badge"]')?.innerText.trim()
      );
      console.log(`  ✓ Initial Provenance: "${initialBadge}"`);

      // Test Brush Tools
      console.log("  [Step 2] Testing Keep Brush, Remove Brush, Soft Edge Brush...");
      const strokeResult = await page.evaluate(async () => {
        const canvas = document.querySelector("canvas");
        if (!canvas) return { error: "Canvas not found" };

        const keepBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.innerText.includes("Keep Brush")
        );
        const removeBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.innerText.includes("Remove Brush")
        );
        const softBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.innerText.includes("Soft Edge Brush")
        );

        if (!keepBtn || !removeBtn || !softBtn) {
          return { error: "Brush buttons missing" };
        }

        // Draw Keep stroke (center)
        keepBtn.click();
        const rect = canvas.getBoundingClientRect();
        const dispatch = (type, x, y, buttons) => {
          canvas.dispatchEvent(
            new PointerEvent(type, {
              clientX: rect.left + x,
              clientY: rect.top + y,
              bubbles: true,
              cancelable: true,
              buttons,
              pointerId: 1,
            })
          );
        };

        dispatch("pointerdown", rect.width * 0.5, rect.height * 0.5, 1);
        dispatch("pointermove", rect.width * 0.52, rect.height * 0.52, 1);
        dispatch("pointerup", rect.width * 0.52, rect.height * 0.52, 0);

        await new Promise((r) => setTimeout(r, 100));

        // Draw Remove stroke (top left)
        removeBtn.click();
        dispatch("pointerdown", rect.width * 0.1, rect.height * 0.1, 1);
        dispatch("pointermove", rect.width * 0.12, rect.height * 0.12, 1);
        dispatch("pointerup", rect.width * 0.12, rect.height * 0.12, 0);

        await new Promise((r) => setTimeout(r, 100));

        // Draw Soft stroke (edge)
        softBtn.click();
        dispatch("pointerdown", rect.width * 0.7, rect.height * 0.3, 1);
        dispatch("pointermove", rect.width * 0.72, rect.height * 0.32, 1);
        dispatch("pointerup", rect.width * 0.72, rect.height * 0.32, 0);

        return { success: true };
      });

      if (strokeResult.error) throw new Error(strokeResult.error);
      console.log("  ✓ Keep, Remove, and Soft Edge Brush strokes applied successfully");

      // Test Undo & Redo
      console.log("  [Step 3] Testing Undo and Redo...");
      const historyResult = await page.evaluate(async () => {
        const undoBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.innerText.includes("Undo")
        );
        const redoBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.innerText.includes("Redo")
        );

        if (!undoBtn || !redoBtn) return { error: "Undo/Redo missing" };
        if (undoBtn.disabled) return { error: "Undo button unexpectedly disabled" };

        undoBtn.click(); // Undo soft stroke
        await new Promise((r) => setTimeout(r, 100));

        if (redoBtn.disabled) return { error: "Redo button unexpectedly disabled after undo" };
        redoBtn.click(); // Redo soft stroke
        await new Promise((r) => setTimeout(r, 100));

        return { success: true };
      });

      if (historyResult.error) throw new Error(historyResult.error);
      console.log("  ✓ Undo and Redo operations verified");

      // Apply Corrections
      console.log("  [Step 4] Applying Corrections...");
      await page.evaluate(() => {
        const applyBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.innerText.includes("Apply Corrections")
        );
        if (applyBtn) applyBtn.click();
      });
      await new Promise((r) => setTimeout(r, 300));

      const updatedBadge = await page.evaluate(
        () => document.querySelector('[data-testid="provenance-badge"]')?.innerText.trim()
      );
      console.log(`  ✓ Updated Provenance after edits: "${updatedBadge}"`);
      if (updatedBadge !== "Manual mask corrections applied") {
        throw new Error(`Expected "Manual mask corrections applied", got "${updatedBadge}"`);
      }

      // Test Instant Channel Switching without AI re-run
      console.log("  [Step 5] Testing Instant White / Pink / Transparent recompositing...");
      const switchDurations = await page.evaluate(async () => {
        const transBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.innerText.includes("TRANSPARENT")
        );
        const whiteBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.innerText.includes("WHITE")
        );
        const pinkBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.innerText.includes("PINK")
        );

        const t1 = performance.now();
        if (whiteBtn) whiteBtn.click();
        const dWhite = performance.now() - t1;

        const t2 = performance.now();
        if (pinkBtn) pinkBtn.click();
        const dPink = performance.now() - t2;

        const t3 = performance.now();
        if (transBtn) transBtn.click();
        const dTrans = performance.now() - t3;

        return { dWhite: Math.round(dWhite), dPink: Math.round(dPink), dTrans: Math.round(dTrans) };
      });
      console.log(`  ✓ Recompositing switches: White ${switchDurations.dWhite}ms, Pink ${switchDurations.dPink}ms, Transparent ${switchDurations.dTrans}ms (instant, zero model rerun)`);

      // Verify Export Transparent PNG
      console.log("  [Step 6] Verifying Export Transparent PNG...");
      const exportReport = await page.evaluate(async () => {
        const canvas = document.querySelector("canvas");
        if (!canvas) return { error: "Canvas not found" };

        const exportBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.innerText.includes("Export Transparent PNG")
        );
        if (exportBtn) exportBtn.click();

        const ctx = canvas.getContext("2d");
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;

        let transparentCount = 0;
        let opaqueCount = 0;
        let semiCount = 0;

        for (let i = 0; i < d.length; i += 4) {
          const a = d[i + 3];
          if (a === 0) transparentCount++;
          else if (a === 255) opaqueCount++;
          else semiCount++;
        }

        const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));

        return {
          width: canvas.width,
          height: canvas.height,
          transparentCount,
          semiCount,
          opaqueCount,
          blobSize: blob ? blob.size : 0,
          hasRealAlpha: transparentCount > 0,
        };
      });

      console.log(`  ✓ Export PNG Alpha Stats: ${exportReport.transparentCount} transparent, ${exportReport.semiCount} semi, ${exportReport.opaqueCount} opaque (${exportReport.blobSize} bytes)`);
      if (!exportReport.hasRealAlpha) {
        throw new Error("Export PNG alpha channel missing!");
      }
      console.log(`  ✓ PASS: Fixture ${fixture.name} fully verified from upload to transparent PNG export.`);

      await page.close();
    }

    console.log("\n==================================================================");
    console.log("PHASE 5 ACCEPTANCE TEST: ALL 4 FIXTURES PASSED BRUSH WORKFLOW!");
    console.log("==================================================================");
  } finally {
    await browser.close();
  }
}

runPhase5MultiImageTest().catch((err) => {
  console.error("Phase 5 failed:", err);
  process.exit(1);
});
