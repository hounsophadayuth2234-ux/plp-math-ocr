import puppeteer from 'puppeteer-core';

async function test() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('[BROWSER]', msg.type(), msg.text()));

  await page.goto('http://localhost:3005/bg-remover');
  
  const input = await page.$('input#bg-source-file-input');
  await input.uploadFile('test-fixtures/fixture-1200x1200.jpg');
  await new Promise(r => setTimeout(r, 1000));
  
  // click fast preview
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('FAST PREVIEW'));
    if (btn) btn.click();
  });
  
  // Wait up to 30s
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const status = await page.evaluate(() => {
      const primaryDownload = document.querySelector('[data-testid="primary-download"]');
      const err = document.querySelector('.border-rose-500\\/50');
      const scanner = document.querySelector('.animate-laser-scan');
      return {
        hasDownload: !!primaryDownload,
        hasError: !!err,
        errorText: err ? err.textContent : null,
        isScanning: !!scanner
      };
    });
    console.log(`Sec ${i+1}:`, status);
    if (status.hasDownload || status.hasError) break;
  }

  await browser.close();
}

test().catch(console.error);
