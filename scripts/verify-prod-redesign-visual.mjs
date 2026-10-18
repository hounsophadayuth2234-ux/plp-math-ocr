import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const TARGET_URL = 'https://ai-toolkit-hub-nu.vercel.app/bg-remover';
const OUTPUT_DIR = 'C:/Users/User/.gemini/antigravity/brain/6ab72d5f-64ba-43a4-9160-25e339a3b413/screenshots';

async function run() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,1000']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  
  console.log('Navigating to:', TARGET_URL);
  await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  const desktopPath = path.join(OUTPUT_DIR, '15-prod-desktop-overhaul.png');
  await page.screenshot({ path: desktopPath, fullPage: false });
  console.log('Saved desktop screenshot:', desktopPath);

  // Mobile viewport
  await page.setViewport({ width: 375, height: 812 });
  await new Promise(r => setTimeout(r, 1000));
  const mobilePath = path.join(OUTPUT_DIR, '16-prod-mobile-overhaul.png');
  await page.screenshot({ path: mobilePath, fullPage: false });
  console.log('Saved mobile screenshot:', mobilePath);

  await browser.close();
}

run().catch(console.error);
