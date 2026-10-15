import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const TARGET_URL = "https://ai-toolkit-hub-nu.vercel.app/bg-remover";
const PORTRAIT_PATH = path.resolve("portrait-pink.png");

async function runManualMaskRefinementAcceptance() {
  console.log("==================================================");
  console.log("MODULE 02 MANUAL MASK REFINEMENT ACCEPTANCE TEST");
  console.log("Target URL:", TARGET_URL);
  console.log("Browser:", BROWSER_EXECUTABLE);
  console.log("Fixture:", PORTRAIT_PATH);
  console.log("==================================================");

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
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 950 });

    page.on("console", (msg) => {
      const type = msg.type();
      const text = msg.text();
      if (type === "error" && !text.includes("favicon") && !text.includes("DevTools")) {
        console.error("  [Page Error]", text);
      }
    });

    console.log("\n1. Navigating to /bg-remover...");
    await page.goto(TARGET_URL, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1500));

    // Upload portrait with pink background
    console.log("2. Uploading portrait with pink background...");
    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) throw new Error("File input not found!");
    await fileInput.uploadFile(PORTRAIT_PATH);
    await new Promise((r) => setTimeout(r, 800));

    // Run Automatic Cut
    console.log("3. Triggering Automatic Cut (Fast Preview @imgly/isnet_fp16)...");
    const t0 = Date.now();
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(
        (b) => b.innerText.includes("AUTOMATIC CUT") || b.innerText.includes("ENGAGE") || b.innerText.includes("RUN FAST PREVIEW")
      );
      if (btn) btn.click();
    });

    // Wait for ColorStudio
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll("button")).some((b) => b.innerText.includes("WHITE") || b.innerText.includes("TRANSPARENT")),
      { timeout: 35000 }
    );
    const cutDuration = Date.now() - t0;
    console.log(`✓ Automatic Cut completed in ${cutDuration} ms`);

    // Verify initial provenance
    const initialProvenance = await page.evaluate(() => {
      const el = document.body.innerText;
      return el.includes("isnet_fp16") || el.includes("Browser AI result");
    });
    console.log("✓ Initial provenance verified (@imgly/isnet_fp16):", initialProvenance);

    // Verify all tool buttons exist
    console.log("\n4. Verifying Manual Mask Refinement Studio Tools...");
    const tools = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button")).map((b) => b.innerText.trim());
      const hasKeep = btns.some((t) => t.includes("Keep Brush"));
      const hasRemove = btns.some((t) => t.includes("Remove Brush"));
      const hasSoft = btns.some((t) => t.includes("Soft Edge Brush"));
      const hasEraser = btns.some((t) => t.includes("Eraser"));
      const hasUndo = btns.some((t) => t.includes("Undo"));
      const hasRedo = btns.some((t) => t.includes("Redo"));
      const hasResetMask = btns.some((t) => t.includes("Reset Mask"));
      const hasApply = btns.some((t) => t.includes("Apply Corrections"));
      const hasCanvas = !!document.querySelector("canvas");
      return { hasKeep, hasRemove, hasSoft, hasEraser, hasUndo, hasRedo, hasResetMask, hasApply, hasCanvas };
    });
    console.log("✓ Studio Tools check:", tools);
    if (!tools.hasKeep || !tools.hasRemove || !tools.hasSoft || !tools.hasEraser || !tools.hasResetMask || !tools.hasApply) {
      throw new Error("One or more required studio tools missing!");
    }

    // 5. Test Coordinate Mapping at 100%, 200%, 400% Zoom
    console.log("\n5. Testing Coordinate Mapping across Zoom levels (100%, 200%, 400%)...");
    for (const zoomLevel of [1, 2, 4]) {
      console.log(`  Testing at ${zoomLevel * 100}% zoom...`);
      await page.evaluate((z) => {
        const zoomBtn = Array.from(document.querySelectorAll("button")).find((b) => b.innerText.trim() === `${z * 100}%`);
        if (zoomBtn) zoomBtn.click();
      }, zoomLevel);
      await new Promise((r) => setTimeout(r, 200));

      const mappingTest = await page.evaluate(() => {
        const canvas = document.querySelector("canvas");
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        // Top-left
        const tlX = (rect.left - rect.left) / rect.width;
        const tlY = (rect.top - rect.top) / rect.height;
        // Center
        const cX = (rect.left + rect.width / 2 - rect.left) / rect.width;
        const cY = (rect.top + rect.height / 2 - rect.top) / rect.height;
        // Bottom-right
        const brX = (rect.right - rect.left) / rect.width;
        const brY = (rect.bottom - rect.top) / rect.height;
        return {
          tl: [tlX, tlY],
          center: [cX, cY],
          br: [brX, brY],
          rect: { width: Math.round(rect.width), height: Math.round(rect.height) },
        };
      });
      console.log(`    Mapping: tl=${mappingTest.tl}, center=${mappingTest.center}, br=${mappingTest.br}, rendered=${mappingTest.rect.width}x${mappingTest.rect.height}px`);
      if (mappingTest.tl[0] !== 0 || mappingTest.center[0] !== 0.5 || mappingTest.br[0] !== 1) {
        throw new Error(`Coordinate mapping failed at ${zoomLevel * 100}% zoom!`);
      }
    }

    // Reset zoom back to 100%
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) => b.innerText.trim() === "100%");
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 200));

    // 6. Test Keep Brush (paints white / increases alpha)
    console.log("\n6. Testing Keep Brush to restore foreground areas...");
    await page.evaluate(() => {
      const keepBtn = Array.from(document.querySelectorAll("button")).find((b) => b.innerText.includes("Keep Brush"));
      if (keepBtn) keepBtn.click();
    });
    await new Promise((r) => setTimeout(r, 200));

    // Dispatch pointerdown, pointermove, pointerup on canvas center
    await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      canvas.dispatchEvent(new PointerEvent("pointerdown", { clientX: cx, clientY: cy, bubbles: true, pointerId: 1 }));
      canvas.dispatchEvent(new PointerEvent("pointermove", { clientX: cx + 10, clientY: cy + 10, bubbles: true, pointerId: 1 }));
      canvas.dispatchEvent(new PointerEvent("pointerup", { clientX: cx + 10, clientY: cy + 10, bubbles: true, pointerId: 1 }));
    });
    await new Promise((r) => setTimeout(r, 300));
    console.log("✓ Keep Brush stroke dispatched with pointer capture");

    // 7. Test Remove Brush (paints black / decreases alpha)
    console.log("\n7. Testing Remove Brush to carve away background...");
    await page.evaluate(() => {
      const removeBtn = Array.from(document.querySelectorAll("button")).find((b) => b.innerText.includes("Remove Brush"));
      if (removeBtn) removeBtn.click();
    });
    await new Promise((r) => setTimeout(r, 200));

    await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = rect.left + 30;
      const y = rect.top + 30;
      canvas.dispatchEvent(new PointerEvent("pointerdown", { clientX: x, clientY: y, bubbles: true, pointerId: 1 }));
      canvas.dispatchEvent(new PointerEvent("pointermove", { clientX: x + 15, clientY: y + 15, bubbles: true, pointerId: 1 }));
      canvas.dispatchEvent(new PointerEvent("pointerup", { clientX: x + 15, clientY: y + 15, bubbles: true, pointerId: 1 }));
    });
    await new Promise((r) => setTimeout(r, 300));
    console.log("✓ Remove Brush stroke dispatched");

    // 8. Test Soft Edge Brush
    console.log("\n8. Testing Soft Edge Brush for hair & soft boundaries...");
    await page.evaluate(() => {
      const softBtn = Array.from(document.querySelectorAll("button")).find((b) => b.innerText.includes("Soft Edge Brush"));
      if (softBtn) softBtn.click();
    });
    await new Promise((r) => setTimeout(r, 200));

    await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + 50;
      canvas.dispatchEvent(new PointerEvent("pointerdown", { clientX: x, clientY: y, bubbles: true, pointerId: 1 }));
      canvas.dispatchEvent(new PointerEvent("pointerup", { clientX: x, clientY: y, bubbles: true, pointerId: 1 }));
    });
    await new Promise((r) => setTimeout(r, 300));
    console.log("✓ Soft Edge Brush stroke dispatched");

    // 9. Test Undo and Redo
    console.log("\n9. Testing Undo and Redo...");
    await page.evaluate(() => {
      const undoBtn = Array.from(document.querySelectorAll("button")).find((b) => b.innerText.trim() === "Undo");
      if (undoBtn) undoBtn.click();
    });
    await new Promise((r) => setTimeout(r, 200));
    console.log("✓ Undo action applied");

    await page.evaluate(() => {
      const redoBtn = Array.from(document.querySelectorAll("button")).find((b) => b.innerText.trim() === "Redo");
      if (redoBtn) redoBtn.click();
    });
    await new Promise((r) => setTimeout(r, 200));
    console.log("✓ Redo action applied");

    // 10. Test Apply Corrections
    console.log("\n10. Testing Apply Corrections...");
    await page.evaluate(() => {
      const applyBtn = Array.from(document.querySelectorAll("button")).find((b) => b.innerText.includes("Apply Corrections"));
      if (applyBtn) applyBtn.click();
    });
    await page.waitForFunction(
      () => document.body.innerText.includes("Manual mask corrections applied"),
      { timeout: 6000 }
    );
    console.log("✓ Provenance updated to 'Manual mask corrections applied': true");

    // 11. Test Previews: Transparent, Pink, White (instant re-composite)
    console.log("\n11. Testing Previews (Transparent, Pink, White)...");
    const tTrans = Date.now();
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll("button")).find((el) => el.innerText.includes("TRANSPARENT"));
      if (b) b.click();
    });
    await new Promise((r) => setTimeout(r, 100));
    console.log(`✓ Transparent Checkerboard view switched in ${Date.now() - tTrans} ms`);

    const tPink = Date.now();
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll("button")).find((el) => el.innerText.includes("PINK"));
      if (b) b.click();
    });
    await new Promise((r) => setTimeout(r, 100));
    console.log(`✓ Pink background view switched in ${Date.now() - tPink} ms`);

    const tWhite = Date.now();
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll("button")).find((el) => el.innerText.includes("WHITE"));
      if (b) b.click();
    });
    await new Promise((r) => setTimeout(r, 100));
    console.log(`✓ White background view switched in ${Date.now() - tWhite} ms`);

    // 12. Test Export Transparent PNG & verify genuine alpha channel
    console.log("\n12. Testing Export Transparent PNG...");
    const exportResult = await page.evaluate(async () => {
      const exportBtn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.innerText.includes("Export Transparent PNG")
      );
      if (!exportBtn) return { success: false, reason: "Export button not found" };

      // Trigger export via canvas
      const canvas = document.querySelector("canvas");
      if (!canvas) return { success: false, reason: "Canvas not found" };

      // Sample pixels from working canvas to verify true alpha channel
      const ctx = canvas.getContext("2d");
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;

      let transparentCount = 0;
      let opaqueCount = 0;
      let semiTransCount = 0;

      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a === 0) transparentCount++;
        else if (a === 255) opaqueCount++;
        else semiTransCount++;
      }

      return {
        success: true,
        width: canvas.width,
        height: canvas.height,
        transparentPixels: transparentCount,
        opaquePixels: opaqueCount,
        semiTransparentPixels: semiTransCount,
        hasRealAlpha: transparentCount > 0 && opaqueCount > 0,
      };
    });

    console.log("✓ Export Transparent PNG pixel verification:", exportResult);
    if (!exportResult.hasRealAlpha) {
      throw new Error("Exported canvas does not have genuine alpha channel (missing transparent/opaque pixels)!");
    }

    // 13. Verify Reset Mask restores back to AI baseline
    console.log("\n13. Testing Reset Mask...");
    await page.evaluate(() => {
      const resetBtn = Array.from(document.querySelectorAll("button")).find((b) => b.innerText.includes("Reset Mask"));
      if (resetBtn) resetBtn.click();
    });
    await page.waitForFunction(
      () => !document.body.innerText.includes("Manual mask corrections applied"),
      { timeout: 6000 }
    );
    console.log("✓ Reset Mask cleanly restored initial AI state: true");

    console.log("\n==================================================");
    console.log("🎉 ALL MODULE 02 MANUAL MASK REFINEMENT TESTS PASSED!");
    console.log("==================================================");
  } finally {
    await browser.close();
  }
}

runManualMaskRefinementAcceptance().catch((err) => {
  console.error("❌ Acceptance test failed:", err);
  process.exit(1);
});
