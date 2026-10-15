import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";

const BROWSER_EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const FIXTURES_DIR = path.resolve("test-fixtures");
if (!fs.existsSync(FIXTURES_DIR)) fs.mkdirSync(FIXTURES_DIR, { recursive: true });

async function generateMathFixtures() {
  console.log("Generating Math OCR Test Fixtures...");
  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 600, height: 400 });

  async function renderHtmlToImage(html, outputPath, width = 450, height = 200) {
    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            margin: 0;
            padding: 24px;
            background: #ffffff;
            font-family: 'Times New Roman', serif;
            display: inline-block;
          }
          .math-container {
            font-size: 36px;
            color: #000000;
          }
        </style>
      </head>
      <body>
        <div class="math-container">
          ${html}
        </div>
      </body>
      </html>
    `;
    await page.setContent(fullHtml, { waitUntil: "domcontentloaded" });
    const el = await page.$(".math-container");
    await el.screenshot({ path: outputPath, omitBackground: false });
    console.log(`✓ Created: ${path.basename(outputPath)}`);
  }

  // 1. Basic equation: x² + 5x + 6 = 0
  await renderHtmlToImage(
    `<i>x</i><sup>2</sup> + 5<i>x</i> + 6 = 0`,
    path.join(FIXTURES_DIR, "math-01-basic.png")
  );

  // 2. Fraction: (3/4) + (2/3) = 17/12
  await renderHtmlToImage(
    `
    <div style="display: flex; align-items: center; gap: 12px; font-size: 32px;">
      <div style="display: inline-flex; flex-direction: column; align-items: center;">
        <span style="border-bottom: 2px solid #000; padding: 0 4px;">3</span>
        <span>4</span>
      </div>
      <span>+</span>
      <div style="display: inline-flex; flex-direction: column; align-items: center;">
        <span style="border-bottom: 2px solid #000; padding: 0 4px;">2</span>
        <span>3</span>
      </div>
      <span>=</span>
      <div style="display: inline-flex; flex-direction: column; align-items: center;">
        <span style="border-bottom: 2px solid #000; padding: 0 4px;">17</span>
        <span>12</span>
      </div>
    </div>
    `,
    path.join(FIXTURES_DIR, "math-02-fraction.png")
  );

  // 3. Exponent and subscript: a₁² + b₂² = c₃²
  await renderHtmlToImage(
    `<i>a</i><sub>1</sub><sup>2</sup> + <i>b</i><sub>2</sub><sup>2</sup> = <i>c</i><sub>3</sub><sup>2</sup>`,
    path.join(FIXTURES_DIR, "math-03-sub-sup.png")
  );

  // 4. Inequality: 2x + 3 ≤ 11
  await renderHtmlToImage(
    `2<i>x</i> + 3 ≤ 11`,
    path.join(FIXTURES_DIR, "math-04-inequality.png")
  );

  // 5. Square root and parentheses: √(x + 1) = 5
  await renderHtmlToImage(
    `
    <div style="display: flex; align-items: center; gap: 8px; font-size: 34px;">
      <span style="font-size: 38px;">√</span>
      <span style="border-top: 2px solid #000; padding-top: 2px;">(<i>x</i> + 1)</span>
      <span>= 5</span>
    </div>
    `,
    path.join(FIXTURES_DIR, "math-05-sqrt.png")
  );

  // 6. Vertical arithmetic:
  //    347
  //  + 285
  //  -----
  //    632
  await renderHtmlToImage(
    `
    <table style="border-collapse: collapse; font-size: 32px; font-family: 'Times New Roman', serif; text-align: right; margin: 10px;">
      <tr>
        <td style="padding: 2px 8px; width: 30px;"></td>
        <td style="padding: 2px 8px;">3</td>
        <td style="padding: 2px 8px;">4</td>
        <td style="padding: 2px 8px;">7</td>
      </tr>
      <tr>
        <td style="padding: 2px 8px;">+</td>
        <td style="padding: 2px 8px;">2</td>
        <td style="padding: 2px 8px;">8</td>
        <td style="padding: 2px 8px;">5</td>
      </tr>
      <tr style="border-top: 2px solid #000;">
        <td style="padding: 4px 8px;"></td>
        <td style="padding: 4px 8px;">6</td>
        <td style="padding: 4px 8px;">3</td>
        <td style="padding: 4px 8px;">2</td>
      </tr>
    </table>
    `,
    path.join(FIXTURES_DIR, "math-06-vertical.png")
  );

  // 7. Multiple lines:
  //    2x + 3y = 7
  //    4x - y = 5
  await renderHtmlToImage(
    `
    <div style="font-size: 32px; line-height: 1.8;">
      <div>2<i>x</i> + 3<i>y</i> = 7</div>
      <div>4<i>x</i> - <i>y</i> = 5</div>
    </div>
    `,
    path.join(FIXTURES_DIR, "math-07-multiline.png")
  );

  // 8. Unclear symbol: 5x + [blur] = 10
  await renderHtmlToImage(
    `
    <div style="display: flex; align-items: center; gap: 8px; font-size: 32px;">
      <span>5<i>x</i> + </span>
      <div style="width: 28px; height: 32px; background: radial-gradient(circle, #333 40%, #888 80%, transparent 100%); filter: blur(3px); display: inline-block;"></div>
      <span> = 10</span>
    </div>
    `,
    path.join(FIXTURES_DIR, "math-08-unclear.png")
  );

  await browser.close();
  console.log("All Math fixtures generated successfully!");
}

generateMathFixtures();
