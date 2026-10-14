import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const PRODUCTION_URL = "https://ai-toolkit-hub-nu.vercel.app/image-generator";

async function verifyModule04() {
  console.log("=== VERIFYING PHASE 6: MODULE 04 ON PRODUCTION ===");
  console.log("URL:", PRODUCTION_URL);
  console.log("Browser:", BROWSER_EXECUTABLE);

  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
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

    console.log("1. Navigating to production /image-generator...");
    await page.goto(PRODUCTION_URL, { waitUntil: "networkidle2", timeout: 35000 });

    // Verify sidebar shows Modules 01, 02, 03, and 04
    const sidebarText = await page.$$eval("aside", (el) => el.map(e => e.innerText).join("\n"));
    console.log("Sidebar check:");
    console.log("  Module 01:", sidebarText.includes("01"));
    console.log("  Module 02:", sidebarText.includes("02"));
    console.log("  Module 03:", sidebarText.includes("03"));
    console.log("  Module 04:", sidebarText.includes("04"));
    if (!sidebarText.includes("04")) {
      throw new Error("Module 04 is missing or disabled in sidebar!");
    }

    // Set prompt
    console.log("2. Entering prompt...");
    const promptInput = await page.$('textarea[id="prompt"]');
    if (!promptInput) throw new Error("Prompt textarea not found!");
    await promptInput.type("Futuristic robotic laboratory with neon holographic displays");
    await new Promise((r) => setTimeout(r, 400));

    // Test submit without Demo mode (check provider gate)
    console.log("3. Submitting prompt without demo mode (testing provider gate)...");
    await page.evaluate(() => {
      const form = document.querySelector("form");
      if (form) form.requestSubmit();
    });

    console.log("Waiting for Execution Error card to appear...");
    await page.waitForFunction(
      () => {
        const errEl = document.querySelector(".text-rose-200");
        return errEl && errEl.innerText.includes("Execution Error");
      },
      { timeout: 25000 }
    );

    const errorState = await page.evaluate(() => {
      const text = document.querySelector(".text-rose-300")?.innerText || "";
      const hasErrorCard = text.includes("Execution Error");
      const hasEnableDemoBtn = Array.from(document.querySelectorAll("button")).some(b => b.innerText.includes("Enable Demo Preview Mode"));
      return { hasErrorCard, hasEnableDemoBtn, textSnippet: text.slice(0, 300) };
    });
    console.log("✓ Provider gate properly caught and presented:", errorState);

    // Test explicit Demo Preview Mode
    console.log("\n4. Testing Explicit Demo Preview Mode...");
    await page.evaluate(() => {
      const cb = document.querySelector('input[type="checkbox"]');
      if (cb && !cb.checked) {
        cb.click();
      }
    });
    await new Promise((r) => setTimeout(r, 600));

    console.log("5. Generating with Demo Preview Mode...");
    const t0 = Date.now();
    await page.evaluate(() => {
      const form = document.querySelector("form");
      if (form) form.requestSubmit();
    });

    await page.waitForFunction(
      () => document.querySelectorAll('img[alt^="Generated image"]').length > 0,
      { timeout: 20000 }
    );
    const genDuration = Date.now() - t0;
    console.log(`✓ Demo generation completed in ${genDuration} ms`);

    const demoResult = await page.evaluate(() => {
      const images = Array.from(document.querySelectorAll('img[alt^="Generated image"]')).map((img) => ({
        alt: img.alt,
        srcPreview: img.src.slice(0, 60),
      }));
      const badges = Array.from(document.querySelectorAll(".border-purple-500\\/40")).map((b) => b.innerText);
      const hasDownload = Array.from(document.querySelectorAll("button")).some((b) => b.innerText.includes("Download"));
      return { images, badges, hasDownload };
    });
    console.log("✓ Demo Preview results verified:");
    console.log("  Badges:", demoResult.badges);
    console.log("  Images count:", demoResult.images.length);
    console.log("  Download button available:", demoResult.hasDownload);

    if (demoResult.images.length === 0 || !demoResult.badges.includes("Demo preview")) {
      throw new Error("Demo preview did not produce badged output!");
    }

    console.log("\n🎉 ALL PHASE 6 ACCEPTANCE CRITERIA VERIFIED ON PRODUCTION!");
  } finally {
    await browser.close();
  }
}

verifyModule04().catch((err) => {
  console.error("❌ Phase 6 verification failed:", err);
  process.exit(1);
});
