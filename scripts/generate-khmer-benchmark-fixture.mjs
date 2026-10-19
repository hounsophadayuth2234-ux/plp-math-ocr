import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generate() {
  const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const execPath = fs.existsSync(chromePath) ? chromePath : edgePath;

  const browser = await puppeteer.launch({
    executablePath: execPath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 640, height: 480, deviceScaleFactor: 1 });

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            width: 640px;
            height: 480px;
            background: #ffffff;
            font-family: 'Leelawadee UI', 'Khmer OS', 'Segoe UI', 'Khmer OS System', sans-serif;
            color: #111827;
            padding: 24px 28px;
            overflow: hidden;
            position: relative;
          }
          .header-small {
            font-size: 14px;
            color: #4b5563;
            letter-spacing: 0.5px;
            margin-bottom: 6px;
          }
          .title {
            font-size: 22px;
            font-weight: 700;
            color: #1e3a8a;
            margin-bottom: 12px;
            border-bottom: 2px solid #3b82f6;
            padding-bottom: 6px;
          }
          .item {
            font-size: 18px;
            line-height: 1.7;
            margin-bottom: 10px;
            color: #0f172a;
          }
          .formula {
            font-family: 'Cambria Math', 'Segoe UI', sans-serif;
            font-size: 19px;
            font-weight: 600;
            color: #047857;
            background: #f0fdf4;
            padding: 2px 8px;
            border-radius: 4px;
            display: inline-block;
          }
          .edge-text {
            position: absolute;
            bottom: 12px;
            left: 28px;
            right: 28px;
            font-size: 13px;
            color: #64748b;
            display: flex;
            justify-content: space-between;
            border-top: 1px dashed #cbd5e1;
            padding-top: 6px;
          }
          .subtle-angle {
            transform: rotate(-0.25deg);
          }
        </style>
      </head>
      <body>
        <div class="subtle-angle">
          <div class="header-small">ក្រសួងអប់រំ យុវជន និងកីឡា — នាយកដ្ឋានស្រាវជ្រាវ</div>
          <div class="title">វិញ្ញាសាគណិតវិទ្យា ថ្នាក់ទី១២ (Math Exam 2026)</div>
          <div class="item">
            <strong>១. ចូរគណនាតម្លៃនៃប្រមាណវិធី៖</strong> <span class="formula">២ + ៣ = ៥</span>
          </div>
          <div class="item">
            <strong>២. ដោះស្រាយសមីការដឺក្រេទី២៖</strong> <span class="formula">x² + 5x + 6 = 0</span>
          </div>
          <div class="item">
            <strong>៣. អត្ថបទគំរូ៖</strong> ស្ត្រីខ្មែរស្រឡាញ់វប្បធម៌ជាតិ កម្ពុជាដ៏រុងរឿង
          </div>
        </div>
        <div class="edge-text">
          <span>ទំព័រទី ១ / Page 1 (Khmer + English Mixed Text)</span>
          <span>កូដសម្គាល់៖ PLP-KH-2026</span>
        </div>
      </body>
    </html>
  `;

  await page.setContent(html, { waitUntil: "networkidle0" });

  const targetDir = path.resolve(__dirname, "../test/fixtures");
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const outputPath = path.resolve(targetDir, "khmer-benchmark-640x480.png");
  await page.screenshot({ path: outputPath, type: "png" });

  console.log(`Saved benchmark fixture to: ${outputPath}`);
  await browser.close();
}

generate().catch(console.error);
