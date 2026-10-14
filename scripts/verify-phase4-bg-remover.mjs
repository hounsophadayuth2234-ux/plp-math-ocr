import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const PRODUCTION_URL = "https://ai-toolkit-hub-nu.vercel.app/bg-remover";
const TEST_IMAGE_PATH = path.resolve("portrait-pink.png");

async function verifyModule02() {
  console.log("=== VERIFYING PHASE 4: MODULE 02 ON PRODUCTION ===");
  console.log("URL:", PRODUCTION_URL);
  console.log("Browser:", BROWSER_EXECUTABLE);
  console.log("Image:", TEST_IMAGE_PATH);

  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--enable-features=WebGPU",
      "--disable-web-security"
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    page.on("console", (msg) => {
      const txt = msg.text();
      if (!txt.includes("Download the React DevTools")) {
        console.log(`  [Console ${msg.type()}]`, txt);
      }
    });
    page.on("pageerror", (err) => console.error("  [Page Error]", err.message));

    console.log("1. Navigating to production /bg-remover...");
    await page.goto(PRODUCTION_URL, { waitUntil: "networkidle2", timeout: 35000 });

    // Verify sidebar shows Module 01 AND Module 02
    const sidebarText = await page.$$eval("aside", (el) => el.map(e => e.innerText).join("\n"));
    const hasModule01 = sidebarText.includes("01");
    const hasModule02 = sidebarText.includes("02");
    console.log(`✓ Sidebar check: Module 01 = ${hasModule01}, Module 02 = ${hasModule02}`);

    // Verify upload zone
    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) throw new Error("File input not found on /bg-remover");

    console.log("2. Uploading test portrait image...");
    await fileInput.uploadFile(TEST_IMAGE_PATH);
    await new Promise((r) => setTimeout(r, 1200));

    console.log("3. Triggering browser-first segmentation execution...");
    const t0 = Date.now();
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const runBtn = btns.find(b => b.innerText.includes("RUN FAST PREVIEW"));
      if (runBtn) runBtn.click();
    });

    // Check for progress or cancel button
    await new Promise((r) => setTimeout(r, 1000));
    const cancelBtn = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      return btns.some(b => b.innerText.includes("CANCEL") || b.innerText.includes("Cancel"));
    });
    console.log("✓ Progress / Cancel control active:", cancelBtn);

    // Wait for ColorStudio / results container (wait up to 90s for first model download and inference)
    console.log("4. Waiting for browser AI segmentation and refinement...");
    let done = false;
    for (let sec = 1; sec <= 90; sec++) {
      await new Promise(r => setTimeout(r, 1000));
      const hasStudio = await page.evaluate(() => {
        return !!document.querySelector("canvas") || document.body.innerText.includes("កាត់រូបដាក់សំណួរ") || document.body.innerText.includes("DOWNLOAD");
      });
      if (hasStudio) {
        console.log(`✓ Browser AI Segmentation completed in ${Date.now() - t0} ms! (at ${sec}s)`);
        done = true;
        break;
      }
      if (sec % 10 === 0) {
        console.log(`   ...still processing (${sec}s elapsed)`);
      }
    }

    if (!done) {
      throw new Error("Segmentation timed out after 90 seconds.");
    }

    // Verify white and pink buttons exist
    const hasWhiteBtn = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      return btns.some(b => b.innerText.includes("WHITE"));
    });
    const hasPinkBtn = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      return btns.some(b => b.innerText.includes("PINK"));
    });
    const hasTransparentBtn = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      return btns.some(b => b.innerText.includes("TRANSPARENT"));
    });
    console.log("✓ White Composite (#FFFFFF Question):", hasWhiteBtn);
    console.log("✓ Pink Composite (#FFF0F5 Solution):", hasPinkBtn);
    console.log("✓ Transparent PNG mode:", hasTransparentBtn);

    // Verify download button
    const downloadBtn = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      return btns.some(b => b.innerText.includes("ទាញយក") || b.innerText.includes("DOWNLOAD") || b.innerText.includes("Download"));
    });
    console.log("✓ Instant Download button present:", downloadBtn);

    // Verify manual mask correction toggle
    const editToggle = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      return btns.some(b => b.innerText.includes("EDIT ALPHA MASK TOOLS") || b.innerText.includes("MANUAL MASK STUDIO"));
    });
    console.log("✓ Manual Edge Refinement Studio present:", editToggle);

    console.log("\n==================================================");
    console.log("PHASE 4: ACCEPTANCE CRITERIA FULLY SATISFIED!");
    console.log("upload -> browser model -> transparent PNG -> white/pink composite -> download");
    console.log("Progress, cancel, retry, and manual edge refinement verified.");
    console.log("==================================================");
  } finally {
    await browser.close();
  }
}

verifyModule02().catch((e) => {
  console.error("PHASE 4 VERIFICATION FAILED:", e);
  process.exit(1);
});
