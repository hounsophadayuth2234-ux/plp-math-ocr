const puppeteer = require('puppeteer-core');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const TARGET_URL = 'https://ai-toolkit-2xo3ow0cj-hounsophadayuth2234-6445s-projects.vercel.app/bg-remover';

async function run() {
  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,1000']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });

  // Click on theme selector button
  await page.click('[data-testid="theme-toggle-btn"]');
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: 'preview-theme-dropdown.png' });
  console.log('Dropdown screenshot saved');

  await browser.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
