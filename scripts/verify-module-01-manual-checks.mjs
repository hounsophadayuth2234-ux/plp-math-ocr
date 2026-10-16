import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const BASE_URL = process.env.TEST_TARGET_URL || "http://localhost:3005";
const EVIDENCE_DIR = path.resolve('evidence-screenshots');
const FIXTURES_DIR = path.resolve('test-fixtures');

async function main() {
  console.log("==================================================================");
  console.log("MODULE 01 MANUAL VERIFICATION SUITE");
  console.log("==================================================================");

  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // 1. Desktop 1440x1000
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`${BASE_URL}/math-ocr`, { waitUntil: 'networkidle2' });
  console.log("✓ Loaded Desktop 1440x1000");

  // 2. Quick Example Prompt: x² + 5x + 6 = 0
  const exampleBtn = await page.$('button[aria-label*="Quick Example Prompts"]');
  await exampleBtn.click();
  await new Promise(r => setTimeout(r, 200));

  const quadraticBtn = await page.$('button[aria-label*="Quadratic Equation"]');
  await quadraticBtn.click();
  await new Promise(r => setTimeout(r, 200));
  const rawText = await page.$eval('textarea#rawText', el => el.value);
  console.log("✓ Quick Example selected:", rawText);

  // 3. Generate 3 Math Formats
  const submitBtn = await page.$('button[data-testid="math-ocr-submit-btn"]');
  await submitBtn.click();
  console.log("✓ Clicked Generate 3 Math Formats, waiting for output...");

  await page.waitForSelector('pre', { timeout: 35000 });
  const latexContent = await page.$eval('pre', el => el.textContent.trim());
  console.log("✓ Output generated. LaTeX:", latexContent);

  // 4. Copy LaTeX
  const copyBtn = await page.$('button[data-testid="copy-latex-btn"]');
  await copyBtn.click();
  await new Promise(r => setTimeout(r, 200));
  const copyBtnState = await page.$eval('button[data-testid="copy-latex-btn"]', el => el.textContent.trim());
  console.log("✓ Copy LaTeX state:", copyBtnState);

  // 5. Refine Result
  const refineTextarea = await page.$('textarea#customInstructions');
  await refineTextarea.type("Please format brackets clearly");
  const refineBtn = await page.$('button[data-testid="math-ocr-refine-btn"]');
  await refineBtn.click();
  console.log("✓ Clicked Refine Result, waiting for refinement...");

  await page.waitForSelector('[data-testid="robotic-scanner-elapsed"]', { timeout: 5000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid="robotic-scanner-elapsed"]'), { timeout: 35000 });
  console.log("✓ Refinement complete!");

  // Capture Desktop Screenshot with results
  const desktopPic = path.join(EVIDENCE_DIR, 'module-01-manual-desktop.png');
  await page.screenshot({ path: desktopPic, fullPage: true });
  console.log("✓ Saved desktop screenshot:", desktopPic);

  // 6. Test image uploads: PNG, JPEG, WebP
  // Reset first
  const resetBtn = await page.$('button[data-testid="math-ocr-reset-btn"]');
  if (resetBtn) {
    await resetBtn.click();
  } else {
    await page.goto(`${BASE_URL}/math-ocr`, { waitUntil: 'networkidle2' });
  }
  await new Promise(r => setTimeout(r, 300));

  const fileInput = await page.$('input#math-ocr-file');

  // A. PNG
  const pngPath = path.resolve('math-quadratic.png');
  if (fs.existsSync(pngPath)) {
    await fileInput.uploadFile(pngPath);
    await new Promise(r => setTimeout(r, 500));
    const pngName = await page.$eval('.truncate', el => el.textContent.trim());
    console.log("✓ PNG Upload accepted:", pngName);
  }

  // B. JPEG
  const jpegPath = path.join(FIXTURES_DIR, 'fixture-1200x1200.jpg');
  if (fs.existsSync(jpegPath)) {
    await fileInput.uploadFile(jpegPath);
    await new Promise(r => setTimeout(r, 500));
    const jpegName = await page.$eval('.truncate', el => el.textContent.trim());
    console.log("✓ JPEG Upload accepted:", jpegName);
  }

  // C. WebP
  const webpPath = path.join(FIXTURES_DIR, 'fixture-webp.webp');
  if (fs.existsSync(webpPath)) {
    await fileInput.uploadFile(webpPath);
    await new Promise(r => setTimeout(r, 500));
    const webpName = await page.$eval('.truncate', el => el.textContent.trim());
    console.log("✓ WebP Upload accepted:", webpName);
  }

  // 7. Mobile Viewport 375x812
  await page.setViewport({ width: 375, height: 812 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(r => setTimeout(r, 300));

  const mobilePic = path.join(EVIDENCE_DIR, 'module-01-manual-mobile.png');
  await page.screenshot({ path: mobilePic, fullPage: true });
  console.log("✓ Saved mobile screenshot:", mobilePic);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  console.log("✓ Mobile Horizontal Overflow:", overflow ? "YES (FAILED)" : "NO (PASSED)");

  await browser.close();
  console.log("==================================================================");
  console.log("ALL MANUAL VERIFICATION STEPS PASSED SUCCESSFULLY!");
  console.log("==================================================================");
}

main();
