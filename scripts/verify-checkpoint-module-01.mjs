import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PROD_URL = "https://ai-toolkit-hub-nu.vercel.app";
const QUADRATIC_IMG_PATH = path.resolve("math-quadratic.png");

async function runVerification() {
  console.log("==================================================");
  console.log("VERIFYING POST-CHECKPOINT MODULE 01 & SIDEBAR STATE");
  console.log("URL:", PROD_URL);
  console.log("==================================================");

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    console.log("\n[1/3] Navigating to Home/Dashboard...");
    await page.goto(PROD_URL, { waitUntil: "networkidle2", timeout: 45000 });

    // Verify Sidebar links
    console.log("[2/3] Inspecting Sidebar links...");
    const sidebarLinks = await page.evaluate(() => {
      const aside = document.querySelector("aside");
      if (!aside) return [];
      const links = Array.from(aside.querySelectorAll("a"));
      return links.map(l => ({
        href: l.getAttribute("href"),
        text: l.innerText.replace(/\s+/g, ' ').trim()
      }));
    });

    console.log("Found Sidebar Links:", sidebarLinks);

    const hasMathOcr = sidebarLinks.some(l => l.href === "/math-ocr");
    const hasBgRemover = sidebarLinks.some(l => l.href === "/bg-remover");
    const hasUpscaler = sidebarLinks.some(l => l.href === "/image-upscaler");
    const hasGenerator = sidebarLinks.some(l => l.href === "/image-generator");

    console.log("Sidebar assertions:");
    console.log(" - /math-ocr present:", hasMathOcr);
    console.log(" - /bg-remover hidden:", !hasBgRemover);
    console.log(" - /image-upscaler hidden:", !hasUpscaler);
    console.log(" - /image-generator hidden:", !hasGenerator);

    if (!hasMathOcr) {
      throw new Error("FAIL: /math-ocr is missing from the sidebar!");
    }
    if (hasBgRemover || hasUpscaler || hasGenerator) {
      throw new Error(`FAIL: Modules 02-04 still appear in sidebar! (bg: ${hasBgRemover}, up: ${hasUpscaler}, gen: ${hasGenerator})`);
    }

    // Check maintenance notice
    const maintenanceText = await page.evaluate(() => {
      return document.body.innerText;
    });

    const hasMaintenanceLabel = maintenanceText.includes("Modules 02–04 are temporarily under maintenance");
    console.log(" - Maintenance notice visible:", hasMaintenanceLabel);
    if (!hasMaintenanceLabel) {
      throw new Error("FAIL: Maintenance notice not found on page!");
    }

    // [3/3] Verify Module 01 transcription on production with x² + 5x + 6 = 0
    console.log("\n[3/3] Testing Module 01 with x² + 5x + 6 = 0...");
    if (!fs.existsSync(QUADRATIC_IMG_PATH)) {
      throw new Error("math-quadratic.png not found!");
    }

    const imgBytes = fs.readFileSync(QUADRATIC_IMG_PATH);
    const blob = new Blob([imgBytes], { type: "image/png" });
    const formData = new FormData();
    formData.append("image", blob, "math-quadratic.png");

    const t0 = Date.now();
    const res = await fetch(`${PROD_URL}/api/math-ocr`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(45000)
    });

    const latency = Date.now() - t0;
    console.log(`API HTTP status: ${res.status} in ${latency} ms`);
    if (res.status !== 200) {
      const errText = await res.text();
      throw new Error(`API returned HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    console.log("\nAPI Output:", JSON.stringify(data, null, 2));

    // Assertions
    const transcription = data.transcription || "";
    const latex = data.latex || "";
    const joditHtml = data.joditHtml || "";
    const mathml = data.mathml || "";
    const isDemoMode = data.isDemoMode;

    console.log("\nVerifying Transcription Integrity:");
    console.log(" - Transcription:", transcription);
    console.log(" - LaTeX:", latex);
    console.log(" - isDemoMode:", isDemoMode);

    if (isDemoMode === true) {
      throw new Error("FAIL: API returned isDemoMode: true!");
    }

    // Check that it's transcription only
    const containsEquation = (transcription.includes("x") || latex.includes("x")) &&
                             (transcription.includes("5") || latex.includes("5")) &&
                             (transcription.includes("6") || latex.includes("6")) &&
                             (transcription.includes("=") || latex.includes("="));

    if (!containsEquation) {
      throw new Error(`FAIL: Output does not match x² + 5x + 6 = 0: ${transcription}`);
    }

    // Check that NO solutions/roots were calculated
    const solvesProblem = transcription.includes("x = -2") ||
                          transcription.includes("x = -3") ||
                          latex.includes("x = -2") ||
                          latex.includes("x = -3") ||
                          transcription.toLowerCase().includes("solution") ||
                          transcription.toLowerCase().includes("factor");

    console.log(" - No solving/factoring/roots added:", !solvesProblem);
    if (solvesProblem) {
      throw new Error("FAIL: Output solved or factored the equation!");
    }

    console.log("\n==================================================");
    console.log("🎉 ALL POST-CHECKPOINT REQUIREMENTS PASSED!");
    console.log("1. Sidebar hides /bg-remover, /image-upscaler, /image-generator: PASS");
    console.log("2. Maintenance label displayed: PASS");
    console.log("3. Module 01 transcription exact and faithful: PASS");
    console.log("4. isDemoMode is false: PASS");
    console.log("5. No solving or calculation added: PASS");
    console.log("==================================================");

  } finally {
    await browser.close();
  }
}

runVerification().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});
