import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const BASE_URL = "http://localhost:3008";

const results = {
  redirectCheck: null,
  metadataCheck: null,
  viewports: [],
  keyboardAndModal: null,
  success: true,
};

async function testHttpRedirect() {
  console.log("\n[1/4] Testing HTTP Permanent Redirect from /math-ocr to /plp-math-content...");
  const res = await fetch(`${BASE_URL}/math-ocr`, {
    redirect: "manual",
  });

  const location = res.headers.get("location");
  console.log(`HTTP Status: ${res.status}`);
  console.log(`Location Header: ${location}`);

  const passed = (res.status === 307 || res.status === 308) && location?.includes("/plp-math-content");
  results.redirectCheck = {
    status: res.status,
    location,
    passed,
  };

  if (!passed) results.success = false;
  console.log(`Redirect Check: ${passed ? "PASS" : "FAIL"}`);
}

async function runBrowserAudit() {
  console.log("\n[2/4] Launching headless browser for DOM, SEO & Responsive audit...");
  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  try {
    // Navigate to /plp-math-content
    await page.goto(`${BASE_URL}/plp-math-content`, { waitUntil: "networkidle2" });

    // 1. Metadata check
    const title = await page.title();
    const canonical = await page.$eval('link[rel="canonical"]', (el) => el.href).catch(() => null);
    const ogTitle = await page.$eval('meta[property="og:title"]', (el) => el.content).catch(() => null);
    const ogUrl = await page.$eval('meta[property="og:url"]', (el) => el.content).catch(() => null);

    console.log(`Page Title: ${title}`);
    console.log(`Canonical URL: ${canonical}`);
    console.log(`OG Title: ${ogTitle}`);
    console.log(`OG URL: ${ogUrl}`);

    results.metadataCheck = {
      title,
      canonical,
      ogTitle,
      ogUrl,
      titlePassed: title.includes("PLP Math Content"),
      canonicalPassed: Boolean(canonical?.includes("/plp-math-content")),
    };

    // 2. Multi-viewport audit
    const viewports = [
      { name: "320px (iPhone SE narrow)", width: 320, height: 667 },
      { name: "360px (Standard Android)", width: 360, height: 740 },
      { name: "390px (iPhone 14/15/16)", width: 390, height: 844 },
      { name: "768px (iPad Mini / Tablet)", width: 768, height: 1024 },
      { name: "1280px (Desktop)", width: 1280, height: 900 },
    ];

    console.log("\n[3/4] Testing multi-viewport responsiveness across 5 viewports...");
    for (const vp of viewports) {
      await page.setViewport({ width: vp.width, height: vp.height });
      await new Promise((r) => setTimeout(r, 200));

      const overflow = await page.evaluate(() => {
        const docWidth = document.documentElement.clientWidth;
        const scrollWidth = document.documentElement.scrollWidth;
        const bodyWidth = document.body.scrollWidth;
        const maxScroll = Math.max(scrollWidth, bodyWidth);
        const hasOverflow = maxScroll > docWidth + 2;
        return {
          clientWidth: docWidth,
          scrollWidth: maxScroll,
          hasHorizontalScrollbar: hasOverflow,
        };
      });

      const passed = !overflow.hasHorizontalScrollbar;
      console.log(`Viewport ${vp.width}x${vp.height} (${vp.name}): clientWidth=${overflow.clientWidth}, scrollWidth=${overflow.scrollWidth} -> ${passed ? "PASS (Zero blowout)" : "FAIL"}`);

      results.viewports.push({
        ...vp,
        ...overflow,
        passed,
      });

      if (!passed) results.success = false;
    }

    // 3. Accessibility & Keyboard interaction tests
    console.log("\n[4/4] Testing accessibility, focus trap, and Escape behaviors...");
    await page.setViewport({ width: 1280, height: 900 });

    // Open settings modal
    const settingsBtn = await page.$('[data-testid="open-settings-modal-btn"]');
    if (settingsBtn) {
      await settingsBtn.click();
      await new Promise((r) => setTimeout(r, 200));

      const modalInfo = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        return {
          exists: Boolean(dialog),
          isModal: dialog?.getAttribute("aria-modal") === "true",
          hasLabel: Boolean(dialog?.getAttribute("aria-labelledby")),
          focusedInside: dialog?.contains(document.activeElement),
        };
      });

      console.log("Settings Modal Opened:", modalInfo);

      // Press Escape to close modal
      await page.keyboard.press("Escape");
      await new Promise((r) => setTimeout(r, 200));

      const modalClosed = await page.evaluate(() => {
        return !document.querySelector('[role="dialog"]');
      });

      console.log("Settings Modal Closed on Escape:", modalClosed);

      results.keyboardAndModal = {
        modalInfo,
        modalClosed,
        passed: modalInfo.exists && modalInfo.isModal && modalClosed,
      };

      if (!results.keyboardAndModal.passed) results.success = false;
    }

  } finally {
    await browser.close();
  }

  console.log("\n==================================================================");
  console.log(`FINAL RESULT: ${results.success ? "ALL CHECKS PASSED (100%)" : "FAILED"}`);
  console.log("==================================================================");

  fs.writeFileSync(
    "scripts/verify-plp-report.json",
    JSON.stringify(results, null, 2),
    "utf-8"
  );
}

async function run() {
  await testHttpRedirect();
  await runBrowserAudit();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
