import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const PRODUCTION_URL = "https://ai-toolkit-hub-nu.vercel.app";
const TEST_IMAGE_PATH = path.resolve("test-subject.png");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("=== STARTING END-TO-END PRODUCTION VERIFICATION ===");
console.log("Target Production:", PRODUCTION_URL);
console.log("Browser Engine:", BROWSER_EXECUTABLE);
console.log("Test Asset:", TEST_IMAGE_PATH);

async function runVerification() {
  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--enable-features=WebGPU",
      "--disable-web-security",
    ],
  });

  const report = {
    module02: {},
    module03: {},
    module04: {},
  };

  try {
    // ----------------------------------------------------
    // TEST MODULE 02: /bg-remover
    // ----------------------------------------------------
    console.log("\n==================================================");
    console.log("TESTING MODULE 02: /bg-remover");
    console.log("==================================================");
    const page02 = await browser.newPage();
    await page02.setViewport({ width: 1280, height: 900 });

    const m2ConsoleErrors = [];
    const m2NetworkRequests = [];
    page02.on("console", (msg) => {
      if (msg.type() === "error") m2ConsoleErrors.push(msg.text());
      else if (msg.text().includes("[bg-remover]") || msg.text().includes("imgly"))
        console.log("  [Browser Console]", msg.text());
    });
    page02.on("request", (req) => {
      const u = req.url();
      if (u.includes("staticimgly") || u.includes("remove-bg") || u.includes("onnx") || u.includes("wasm")) {
        m2NetworkRequests.push({ url: u, method: req.method() });
      }
    });

    const start02 = Date.now();
    await page02.goto(`${PRODUCTION_URL}/bg-remover`, { waitUntil: "networkidle2", timeout: 30000 });
    console.log("Page loaded in", Date.now() - start02, "ms");

    // Upload test image
    const fileInput02 = await page02.$('input[type="file"]');
    if (!fileInput02) throw new Error("Could not find file input on /bg-remover");
    await fileInput02.uploadFile(TEST_IMAGE_PATH);
    console.log("Uploaded test-subject.png to /bg-remover");

    await sleep(1000);

    // Click CH-01 (#FFFFFF) button
    console.log("Clicking CH-01 (#FFFFFF White) execution channel...");
    const buttons = await page02.$$("button");
    let ch01Button = null;
    for (const b of buttons) {
      const text = await page02.evaluate((el) => el.textContent, b);
      if (text && text.includes("CH-01")) {
        ch01Button = b;
        break;
      }
    }

    if (!ch01Button) throw new Error("Could not find CH-01 button");

    const execStart02 = Date.now();
    await ch01Button.click();
    console.log("Triggered segmentation. Waiting for output deck or completion...");

    // Wait for result or error with up to 90s timeout (model downloading on first run)
    let m2Success = false;
    let m2Duration = 0;
    try {
      await page02.waitForFunction(
        () => {
          const body = document.body.innerText;
          return body.includes("COMPOSITE RENDER DECK") || body.includes("EXECUTION ERROR");
        },
        { timeout: 90000, polling: 500 }
      );

      m2Duration = Date.now() - execStart02;
      const pageText = await page02.evaluate(() => document.body.innerText);

      if (pageText.includes("COMPOSITE RENDER DECK")) {
        m2Success = true;
        console.log(`✓ Module 02 segmentation succeeded in ${m2Duration}ms!`);

        // Check the status label badge
        const badgeText = await page02.evaluate(() => {
          const el = document.querySelector("span.ring-1");
          return el ? el.textContent : "Not found";
        });
        console.log("  Provenance Badge:", badgeText);

        // Check download buttons
        const downloadButtons = await page02.$$eval("button", (btns) =>
          btns.map((b) => b.textContent?.trim()).filter((t) => t?.includes("DOWNLOAD"))
        );
        console.log("  Download Options Available:", downloadButtons);

        // Check composite image
        const imgSrc = await page02.evaluate(() => {
          const img = document.querySelector("img[alt='Composite Render']");
          return img ? img.src.slice(0, 60) + "..." : null;
        });
        console.log("  Output image generated:", imgSrc);

        report.module02 = {
          status: "SUCCESS",
          durationMs: m2Duration,
          label: badgeText,
          downloads: downloadButtons,
          networkAssetsDownloaded: m2NetworkRequests.length,
          consoleErrors: m2ConsoleErrors,
        };
      } else {
        const errText = await page02.evaluate(() => {
          const el = document.querySelector(".text-rose-200")?.parentElement;
          return el ? el.textContent : "Unknown error";
        });
        console.log("Module 02 reported error:", errText);
        report.module02 = {
          status: "FAILED",
          durationMs: m2Duration,
          error: errText,
          consoleErrors: m2ConsoleErrors,
        };
      }
    } catch (waitErr) {
      console.error("Module 02 timed out waiting for result:", waitErr.message);
      report.module02 = {
        status: "TIMEOUT",
        durationMs: Date.now() - execStart02,
        consoleErrors: m2ConsoleErrors,
      };
    }

    await page02.close();

    // ----------------------------------------------------
    // TEST MODULE 03: /image-upscaler
    // ----------------------------------------------------
    console.log("\n==================================================");
    console.log("TESTING MODULE 03: /image-upscaler");
    console.log("==================================================");
    const page03 = await browser.newPage();
    await page03.setViewport({ width: 1280, height: 900 });

    const m3ConsoleErrors = [];
    page03.on("console", (msg) => {
      if (msg.type() === "error") m3ConsoleErrors.push(msg.text());
    });

    await page03.goto(`${PRODUCTION_URL}/image-upscaler`, { waitUntil: "networkidle2", timeout: 30000 });
    console.log("Loaded /image-upscaler");

    // 1. Test Browser 2x Mode
    console.log("Testing Path A: Browser 2× Enhanced Resize (Zero-Cost)...");
    const fileInput03 = await page03.$('input[type="file"]');
    if (!fileInput03) throw new Error("Could not find file input on /image-upscaler");
    await fileInput03.uploadFile(TEST_IMAGE_PATH);
    await sleep(500);

    // Click Enhance Image
    const submitBtn03 = await page03.$('button[type="submit"]');
    const start03A = Date.now();
    await submitBtn03.click();

    await page03.waitForFunction(
      () => {
        const body = document.body.innerText;
        return (
          body.includes("Enhanced resize — not AI super-resolution") ||
          body.includes("Execution Error")
        );
      },
      { timeout: 15000 }
    );
    const duration03A = Date.now() - start03A;

    const label03A = await page03.evaluate(() => {
      const el = document.querySelector("span.ring-1");
      return el ? el.textContent : null;
    });
    console.log(`✓ Browser 2× completed in ${duration03A}ms with label: "${label03A}"`);

    // Check slider presence
    const sliderPresent = await page03.evaluate(() => {
      return Boolean(document.querySelector('[role="slider"]'));
    });
    console.log("  Before/After slider rendered:", sliderPresent);

    report.module03 = {
      browser2x: {
        status: "SUCCESS",
        durationMs: duration03A,
        label: label03A,
        sliderPresent,
      },
    };

    // 2. Test Real-ESRGAN AI Mode
    console.log("Testing Path B: Real-ESRGAN (AI Model) mode on production...");
    await page03.reload({ waitUntil: "networkidle2" });
    const fileInput03B = await page03.$('input[type="file"]');
    await fileInput03B.uploadFile(TEST_IMAGE_PATH);
    await sleep(500);

    // Click "Real-ESRGAN (AI)" engine tab
    const aiTabBtn = await page03.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      return btns.find((b) => b.textContent && b.textContent.includes("Real-ESRGAN (AI)"));
    });
    if (aiTabBtn) {
      await aiTabBtn.click();
      console.log("Selected Real-ESRGAN (AI) tab");
      await sleep(500);

      // Click Enhance Image
      const submitBtn03B = await page03.$('button[type="submit"]');
      const start03B = Date.now();
      await submitBtn03B.click();

      // Wait for output or error
      await page03.waitForFunction(
        () => {
          const body = document.body.innerText;
          return (
            body.includes("Cloud API result") ||
            body.includes("Local worker result") ||
            body.includes("Execution Error") ||
            body.includes("Upscaling failed")
          );
        },
        { timeout: 45000 }
      );
      const duration03B = Date.now() - start03B;

      const result03B = await page03.evaluate(() => {
        const body = document.body.innerText;
        if (body.includes("Cloud API result")) return { status: "SUCCESS", label: "Cloud API result" };
        if (body.includes("Local worker result")) return { status: "SUCCESS", label: "Local worker result" };
        const errEl = document.querySelector(".text-rose-200")?.parentElement;
        return { status: "ERROR", error: errEl ? errEl.textContent : "Error" };
      });

      console.log("Real-ESRGAN Result on Vercel:", result03B, `in ${duration03B}ms`);
      report.module03.realEsrgan = {
        ...result03B,
        durationMs: duration03B,
      };
    }

    await page03.close();

    // ----------------------------------------------------
    // TEST MODULE 04: /image-generator
    // ----------------------------------------------------
    console.log("\n==================================================");
    console.log("TESTING MODULE 04: /image-generator");
    console.log("==================================================");
    const page04 = await browser.newPage();
    await page04.setViewport({ width: 1280, height: 900 });

    const m4ConsoleErrors = [];
    page04.on("console", (msg) => {
      if (msg.type() === "error") m4ConsoleErrors.push(msg.text());
    });

    await page04.goto(`${PRODUCTION_URL}/image-generator`, { waitUntil: "networkidle2", timeout: 30000 });
    console.log("Loaded /image-generator");

    // Enter prompt
    const promptInput = await page04.$("textarea#prompt");
    if (!promptInput) throw new Error("Could not find prompt textarea");
    await promptInput.type("A minimalist cyan geometric cube on dark background, vector art");
    console.log("Typed prompt into textarea");

    // Click Synthesize
    const submitBtn04 = await page04.$('button[type="submit"]');
    const start04 = Date.now();
    await submitBtn04.click();
    console.log("Clicked Synthesize without Demo Mode. Waiting for real generation response...");

    await page04.waitForFunction(
      () => {
        const body = document.body.innerText;
        return (
          body.includes("SESSION GALLERY") ||
          body.includes("Execution Error") ||
          body.includes("Generation failed")
        );
      },
      { timeout: 45000 }
    );
    const duration04 = Date.now() - start04;

    const result04 = await page04.evaluate(() => {
      const body = document.body.innerText;
      if (body.includes("SESSION GALLERY")) {
        const label = document.querySelector(".rounded-md.border.font-mono")?.textContent;
        return { status: "SUCCESS", label: label || "Generated" };
      }
      const errEl = document.querySelector(".text-rose-200")?.parentElement;
      return { status: "ERROR", error: errEl ? errEl.textContent : "Error" };
    });

    console.log("Module 04 Result on Vercel:", result04, `in ${duration04}ms`);
    report.module04 = {
      ...result04,
      durationMs: duration04,
    };

    await page04.close();

    console.log("\n==================================================");
    console.log("END-TO-END VERIFICATION SUMMARY REPORT");
    console.log("==================================================");
    console.log(JSON.stringify(report, null, 2));

    fs.writeFileSync("e2e-report.json", JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}

runVerification().catch((err) => {
  console.error("Verification error:", err);
  process.exit(1);
});
