import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const TARGET_URL = process.env.TEST_URL || "http://localhost:3009/plp-math-content";

console.log("=== RUNNING CSS PERFORMANCE & COMPLIANCE VERIFICATION ===");
console.log("Target URL:", TARGET_URL);
console.log("Browser Engine:", BROWSER_EXECUTABLE);

async function runAudit() {
  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  const report = {
    url: TARGET_URL,
    consoleErrors: [],
    desktop: {},
    tablet: {},
    mobile: {},
    buttonsClickable: false,
    formulaMotionWorks: false,
    sidebarModulesBackdrop: {},
    passedAll: false,
  };

  try {
    await page.goto(TARGET_URL, { waitUntil: "networkidle2", timeout: 30000 });

    // 1. Desktop Test (1280x800)
    await page.setViewport({ width: 1280, height: 800 });
    await new Promise((r) => setTimeout(r, 600));

    const desktopRows = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('[data-testid="formula-stream-row"]'));
      return rows.filter((r) => window.getComputedStyle(r).display !== "none").length;
    });

    report.desktop = {
      viewport: "1280x800",
      visibleFormulaRows: desktopRows,
      meetsTarget: desktopRows >= 8 && desktopRows <= 12,
    };
    console.log(`[Desktop 1280px] Visible Formula Rows: ${desktopRows} (Target: 8-12) -> ${report.desktop.meetsTarget ? "PASS" : "FAIL"}`);

    // 2. Tablet Test (768x1024)
    await page.setViewport({ width: 768, height: 1024 });
    await new Promise((r) => setTimeout(r, 600));

    const tabletRows = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('[data-testid="formula-stream-row"]'));
      return rows.filter((r) => window.getComputedStyle(r).display !== "none").length;
    });

    report.tablet = {
      viewport: "768x1024",
      visibleFormulaRows: tabletRows,
      meetsTarget: tabletRows >= 6 && tabletRows <= 8,
    };
    console.log(`[Tablet 768px] Visible Formula Rows: ${tabletRows} (Target: 6-8) -> ${report.tablet.meetsTarget ? "PASS" : "FAIL"}`);

    // 3. Mobile Test (375x667)
    await page.setViewport({ width: 375, height: 667 });
    await new Promise((r) => setTimeout(r, 600));

    const mobileRows = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('[data-testid="formula-stream-row"]'));
      return rows.filter((r) => window.getComputedStyle(r).display !== "none").length;
    });

    report.mobile = {
      viewport: "375x667",
      visibleFormulaRows: mobileRows,
      meetsTarget: mobileRows >= 4 && mobileRows <= 6,
    };
    console.log(`[Mobile 375px] Visible Formula Rows: ${mobileRows} (Target: 4-6) -> ${report.mobile.meetsTarget ? "PASS" : "FAIL"}`);

    // 4. Formula Motion Verification
    const formulaMotion = await page.evaluate(() => {
      const streams = document.querySelectorAll(".formula-stream");
      if (streams.length === 0) return { works: false, reason: "No formula-stream elements found" };
      const stream = streams[0];
      const style = window.getComputedStyle(stream);
      return {
        works: style.animationName !== "none" && Boolean(style.animationName),
        animationName: style.animationName,
        animationDuration: style.animationDuration,
        willChange: style.willChange,
      };
    });
    report.formulaMotionWorks = formulaMotion.works;
    console.log(`[Formula Motion] Active Animation: ${formulaMotion.animationName} (${formulaMotion.animationDuration}) -> ${formulaMotion.works ? "PASS" : "FAIL"}`);

    // 5. Button and Links Clickable Verification
    await page.setViewport({ width: 1280, height: 800 });
    const buttonsClickable = await page.evaluate(() => {
      const submitBtn = document.querySelector('[data-testid="math-ocr-submit-btn"]');
      const backLink = document.querySelector('a[aria-label="Back to Dashboard"]');
      const apiKeyBtn = document.querySelector('[data-testid="open-settings-modal-btn"]');
      
      const submitRect = submitBtn ? submitBtn.getBoundingClientRect() : null;
      const backRect = backLink ? backLink.getBoundingClientRect() : null;
      const apiRect = apiKeyBtn ? apiKeyBtn.getBoundingClientRect() : null;

      const submitStyle = submitBtn ? window.getComputedStyle(submitBtn) : null;
      const backStyle = backLink ? window.getComputedStyle(backLink) : null;

      return {
        hasSubmitBtn: !!submitBtn,
        submitPointerEvents: submitStyle?.pointerEvents,
        submitMinHeight: submitRect?.height,
        hasBackLink: !!backLink,
        backPointerEvents: backStyle?.pointerEvents,
        hasApiKeyBtn: !!apiKeyBtn,
        allClickable: submitStyle?.pointerEvents !== "none" && backStyle?.pointerEvents !== "none",
      };
    });
    report.buttonsClickable = buttonsClickable.allClickable;
    console.log(`[Clickability] Buttons & Links active and clickable -> ${buttonsClickable.allClickable ? "PASS" : "FAIL"}`);

    // 6. Sidebar Module 02 and Module 03 Backdrop-Filter & Transparency Verification
    const sidebarBackdrops = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("aside a.sidebar-module-glass, aside a"));
      const mod2 = links.find((l) => l.getAttribute("href") === "/bg-remover");
      const mod3 = links.find((l) => l.getAttribute("href") === "/image-upscaler");

      const getDetails = (el) => {
        if (!el) return null;
        const style = window.getComputedStyle(el);
        return {
          computedBackdropFilter: style.backdropFilter || style.webkitBackdropFilter || "none",
          backgroundColor: style.backgroundColor,
          opacity: style.opacity,
          isTransparent: style.backgroundColor.includes("rgba") || style.backgroundColor.includes("transparent"),
        };
      };

      return {
        module02: getDetails(mod2),
        module03: getDetails(mod3),
      };
    });

    report.sidebarModulesBackdrop = sidebarBackdrops;
    const mod2Valid = sidebarBackdrops.module02 && sidebarBackdrops.module02.computedBackdropFilter !== "none";
    const mod3Valid = sidebarBackdrops.module03 && sidebarBackdrops.module03.computedBackdropFilter !== "none";
    console.log(`[Sidebar Module 02] computed backdrop-filter: ${sidebarBackdrops.module02?.computedBackdropFilter}, transparent: ${sidebarBackdrops.module02?.isTransparent} -> ${mod2Valid ? "PASS" : "FAIL"}`);
    console.log(`[Sidebar Module 03] computed backdrop-filter: ${sidebarBackdrops.module03?.computedBackdropFilter}, transparent: ${sidebarBackdrops.module03?.isTransparent} -> ${mod3Valid ? "PASS" : "FAIL"}`);

    // Filter console errors
    report.consoleErrors = consoleErrors.filter((e) => !e.includes("Download the React DevTools") && !e.includes("favicon"));
    console.log(`[Console Errors] Count: ${report.consoleErrors.length} -> ${report.consoleErrors.length === 0 ? "PASS" : "FAIL"}`);

    report.passedAll =
      report.desktop.meetsTarget &&
      report.tablet.meetsTarget &&
      report.mobile.meetsTarget &&
      report.formulaMotionWorks &&
      report.buttonsClickable &&
      mod2Valid &&
      mod3Valid &&
      report.consoleErrors.length === 0;

    console.log(`\n=== OVERALL AUDIT STATUS: ${report.passedAll ? "SUCCESS (100% PASS)" : "FAILURE"} ===\n`);
  } catch (err) {
    console.error("Audit error:", err);
    report.error = err.message;
  } finally {
    await browser.close();
  }

  fs.writeFileSync("audit-verification-results.json", JSON.stringify(report, null, 2));
  return report;
}

runAudit().then((r) => {
  if (!r.passedAll) {
    process.exit(1);
  }
});
