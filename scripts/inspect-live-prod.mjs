import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;

async function check() {
  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.goto('https://ai-toolkit-hub-nu.vercel.app/bg-remover', { waitUntil: 'networkidle2' });

  const data = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasHero: text.includes('AI BACKGROUND STUDIO'),
      hasStepper: text.includes('STEP 1') || text.includes('Pipeline Stepper') || !!document.querySelector('.pipeline-stepper'),
      hasSound: text.includes('Cyber Sci-Fi') || !!document.querySelector('[data-testid="studio-audio-btn"]'),
      hasFont: text.includes('Modern Sans') || !!document.querySelector('[data-testid="studio-font-btn"]'),
      hasTheme: text.includes('Cyber Dark') || !!document.querySelector('[data-testid="studio-theme-btn"]'),
      hasKeepForeground: text.includes('Keep foreground'),
      hasKeepPersonText: text.includes('Keep person + text'),
      hasMoreKeepOptions: text.includes('More keep options'),
      hasQualityModes: text.includes('Fast') && text.includes('Balanced') && text.includes('Fine details'),
      hasRemoveBgBtn: text.includes('Remove background') || text.includes('REMOVE BACKGROUND'),
      hasAdvancedSettings: text.includes('Advanced settings')
    };
  });
  console.log(JSON.stringify(data, null, 2));
  await browser.close();
}
check().catch(console.error);
