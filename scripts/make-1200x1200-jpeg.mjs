import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const outDir = path.resolve('test-fixtures');

async function main() {
  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  // Create 1200x1200 test JPEG
  const jpegBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');
    
    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 1200, 1200);
    grad.addColorStop(0, '#f1f5f9');
    grad.addColorStop(1, '#e2e8f0');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1200, 1200);
    
    // Central foreground math figure/circle
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(600, 600, 350, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#06b6d4';
    ctx.font = 'bold 72px sans-serif';
    ctx.fillText('f(x) = x² + 5x + 6', 320, 620);
    
    return canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
  });
  
  fs.writeFileSync(path.join(outDir, 'fixture-1200x1200.jpg'), Buffer.from(jpegBase64, 'base64'));
  console.log('Created fixture-1200x1200.jpg (1200x1200px)');

  // Create WebP test image
  const webpBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 800, 800);
    ctx.fillStyle = '#ec4899';
    ctx.beginPath();
    ctx.arc(400, 400, 250, 0, Math.PI * 2);
    ctx.fill();
    return canvas.toDataURL('image/webp', 0.9).split(',')[1];
  });
  
  fs.writeFileSync(path.join(outDir, 'fixture-webp.webp'), Buffer.from(webpBase64, 'base64'));
  console.log('Created fixture-webp.webp');

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
