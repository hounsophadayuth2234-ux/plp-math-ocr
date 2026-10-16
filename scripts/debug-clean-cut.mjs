import puppeteer from 'puppeteer-core';

async function testCleanCut() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();
  page.on('console', msg => console.log('[LOG]', msg.type(), msg.text()));

  await page.goto('http://localhost:3005/bg-remover');
  const input = await page.$('input#bg-source-file-input');
  await input.uploadFile('test-fixtures/fixture-1200x1200.jpg');
  await new Promise(r => setTimeout(r, 1000));

  // Run Fast preview
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('FAST PREVIEW'));
    btn.click();
  });
  await page.waitForSelector('[data-testid="primary-download"]', { timeout: 60000 });
  console.log('Fast preview done!');

  // Now click Clean cut
  console.log('Clicking Clean cut button...');
  const clicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const cc = btns.find(b => b.textContent && b.textContent.includes('CLEAN CUT · 1200PX'));
    if (cc) {
      cc.click();
      return true;
    }
    return false;
  });
  console.log('Clean cut clicked:', clicked);

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const state = await page.evaluate(() => {
      const scanner = document.querySelector('.animate-laser-scan');
      const err = document.querySelector('.border-rose-500\\/50');
      const mode = document.querySelector('[data-testid="primary-download"]');
      return { isScanning: !!scanner, hasError: !!err, errorMsg: err?.textContent, hasDownload: !!mode };
    });
    console.log(`CC Sec ${i+1}:`, state);
    if (!state.isScanning && (state.hasDownload || state.hasError) && i > 3) {
      console.log('Clean cut completed or settled!');
      break;
    }
  }

  await browser.close();
}

testCleanCut().catch(console.error);
