import assert from "node:assert";
import test from "node:test";
import {
  compositePixel,
  compositeRgbaBuffer,
  switchCompositeMode,
  validateRgbaBuffer,
  generateExportFilename,
} from "../src/lib/bg-compositor.ts";

test("Module 02 RGBA Compositor Suite", async (t) => {
  // ─────────────────────────────────────────────────────────────
  // 1. Opaque foreground on white
  // ─────────────────────────────────────────────────────────────
  await t.test("1. Opaque foreground on white preserves exact foreground color and alpha 255", () => {
    const [r, g, b, a] = compositePixel(12, 34, 56, 255, 255, "white");
    assert.strictEqual(r, 12, "Red channel should remain unchanged");
    assert.strictEqual(g, 34, "Green channel should remain unchanged");
    assert.strictEqual(b, 56, "Blue channel should remain unchanged");
    assert.strictEqual(a, 255, "Alpha must be 255");
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Transparent pixel on white
  // ─────────────────────────────────────────────────────────────
  await t.test("2. Transparent pixel on white composites to pure white #FFFFFF with alpha 255", () => {
    const [r, g, b, a] = compositePixel(12, 34, 56, 255, 0, "white");
    assert.strictEqual(r, 255, "Red must be 255 (#FFFFFF)");
    assert.strictEqual(g, 255, "Green must be 255 (#FFFFFF)");
    assert.strictEqual(b, 255, "Blue must be 255 (#FFFFFF)");
    assert.strictEqual(a, 255, "Alpha must be 255");
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Semi-transparent edge on white
  // ─────────────────────────────────────────────────────────────
  await t.test("3. Semi-transparent edge on white blends smoothly with alpha 255", () => {
    // Pure black pixel with 50% mask alpha (128 / 255)
    const [r, g, b, a] = compositePixel(0, 0, 0, 255, 128, "white");
    const expected = Math.round(0 * (128 / 255) + 255 * (1 - 128 / 255));
    assert.strictEqual(r, expected, "Red must blend linearly");
    assert.strictEqual(g, expected, "Green must blend linearly");
    assert.strictEqual(b, expected, "Blue must blend linearly");
    assert.strictEqual(a, 255, "Alpha must be 255 for solid background");
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Opaque foreground on pink
  // ─────────────────────────────────────────────────────────────
  await t.test("4. Opaque foreground on pink preserves exact foreground color and alpha 255", () => {
    const [r, g, b, a] = compositePixel(90, 80, 70, 255, 255, "pink");
    assert.strictEqual(r, 90, "Red channel preserved");
    assert.strictEqual(g, 80, "Green channel preserved");
    assert.strictEqual(b, 70, "Blue channel preserved");
    assert.strictEqual(a, 255, "Alpha must be 255");
  });

  // ─────────────────────────────────────────────────────────────
  // 5. Transparent pixel on pink
  // ─────────────────────────────────────────────────────────────
  await t.test("5. Transparent pixel on pink composites to Solution Pink #FFF0F5 with alpha 255", () => {
    const [r, g, b, a] = compositePixel(90, 80, 70, 255, 0, "pink");
    assert.strictEqual(r, 255, "Red must be 255 (#FFF0F5)");
    assert.strictEqual(g, 240, "Green must be 240 (#FFF0F5)");
    assert.strictEqual(b, 245, "Blue must be 245 (#FFF0F5)");
    assert.strictEqual(a, 255, "Alpha must be 255");
  });

  // ─────────────────────────────────────────────────────────────
  // 6. Semi-transparent edge on pink
  // ─────────────────────────────────────────────────────────────
  await t.test("6. Semi-transparent edge on pink blends smoothly with alpha 255", () => {
    // Pure blue pixel (0, 0, 255) with 50% mask alpha (128 / 255)
    const [r, g, b, a] = compositePixel(0, 0, 255, 255, 128, "pink");
    const alphaNorm = 128 / 255;
    const invNorm = 1 - alphaNorm;

    const expR = Math.round(0 * alphaNorm + 255 * invNorm);
    const expG = Math.round(0 * alphaNorm + 240 * invNorm);
    const expB = Math.round(255 * alphaNorm + 245 * invNorm);

    assert.strictEqual(r, expR, "Red blended with pink background");
    assert.strictEqual(g, expG, "Green blended with pink background");
    assert.strictEqual(b, expB, "Blue blended with pink background");
    assert.strictEqual(a, 255, "Alpha must be 255");
  });

  // ─────────────────────────────────────────────────────────────
  // 7. Transparent export preserving alpha
  // ─────────────────────────────────────────────────────────────
  await t.test("7. Transparent export preserves original/mask alpha faithfully", () => {
    // Foreground with alpha 200
    const [r1, g1, b1, a1] = compositePixel(110, 120, 130, 255, 200, "transparent");
    assert.strictEqual(r1, 110);
    assert.strictEqual(g1, 120);
    assert.strictEqual(b1, 130);
    assert.strictEqual(a1, 200, "Alpha must be preserved");

    // Fully transparent
    const [r2, g2, b2, a2] = compositePixel(110, 120, 130, 255, 0, "transparent");
    assert.strictEqual(r2, 0);
    assert.strictEqual(g2, 0);
    assert.strictEqual(b2, 0);
    assert.strictEqual(a2, 0, "Alpha must be 0 for transparent background");
  });

  // ─────────────────────────────────────────────────────────────
  // 8. Multiple-pixel RGBA buffers
  // ─────────────────────────────────────────────────────────────
  await t.test("8. Multiple-pixel RGBA buffers (4x4 = 16 pixels)", () => {
    const width = 4;
    const height = 4;
    const totalPixels = width * height;
    const sourceRgba = new Uint8ClampedArray(totalPixels * 4);
    const maskAlpha = new Uint8ClampedArray(totalPixels);

    // Initialize 16 pixels with distinct values and alpha ramp
    for (let i = 0; i < totalPixels; i++) {
      const p = i * 4;
      sourceRgba[p] = i * 10;      // R
      sourceRgba[p + 1] = i * 15;  // G
      sourceRgba[p + 2] = i * 20;  // B
      sourceRgba[p + 3] = 255;     // A
      maskAlpha[i] = Math.round((i / (totalPixels - 1)) * 255); // Alpha ramp 0..255
    }

    // Composite to White
    const whiteOut = compositeRgbaBuffer(sourceRgba, maskAlpha, width, height, "white");
    assert.strictEqual(whiteOut.length, totalPixels * 4);
    for (let i = 0; i < totalPixels; i++) {
      assert.strictEqual(whiteOut[i * 4 + 3], 255, `Pixel ${i} must have alpha 255 on white`);
    }

    // Composite to Pink
    const pinkOut = compositeRgbaBuffer(sourceRgba, maskAlpha, width, height, "pink");
    assert.strictEqual(pinkOut.length, totalPixels * 4);
    for (let i = 0; i < totalPixels; i++) {
      assert.strictEqual(pinkOut[i * 4 + 3], 255, `Pixel ${i} must have alpha 255 on pink`);
    }

    // Composite to Transparent
    const transOut = compositeRgbaBuffer(sourceRgba, maskAlpha, width, height, "transparent");
    assert.strictEqual(transOut.length, totalPixels * 4);
    for (let i = 0; i < totalPixels; i++) {
      assert.strictEqual(transOut[i * 4 + 3], maskAlpha[i], `Pixel ${i} must preserve mask alpha`);
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 9. Invalid RGBA buffer
  // ─────────────────────────────────────────────────────────────
  await t.test("9. Invalid RGBA buffer rejection", () => {
    const validBuf = new Uint8ClampedArray(4 * 4 * 4);
    const validMask = new Uint8ClampedArray(4 * 4);

    // Buffer length mismatch
    const badBuf = new Uint8ClampedArray(10);
    assert.throws(
      () => validateRgbaBuffer(badBuf, validMask, 4, 4),
      /Invalid source RGBA buffer size/,
      "Must reject mismatched buffer length"
    );

    // Mask length mismatch
    const badMask = new Uint8ClampedArray(3);
    assert.throws(
      () => validateRgbaBuffer(validBuf, badMask, 4, 4),
      /Invalid mask buffer size/,
      "Must reject mismatched mask length"
    );

    // Invalid dimensions
    assert.throws(
      () => validateRgbaBuffer(validBuf, validMask, 0, 4),
      /Invalid width: 0/,
      "Must reject zero width"
    );
    assert.throws(
      () => validateRgbaBuffer(validBuf, validMask, 4, -1),
      /Invalid height: -1/,
      "Must reject negative height"
    );
    assert.throws(
      () => validateRgbaBuffer(validBuf, validMask, 4.5, 4),
      /Invalid width: 4.5/,
      "Must reject non-integer width"
    );
  });

  // ─────────────────────────────────────────────────────────────
  // 10. White → Pink mode switching
  // ─────────────────────────────────────────────────────────────
  await t.test("10. White → Pink mode switching", () => {
    const width = 2;
    const height = 1;
    const sourceRgba = new Uint8ClampedArray([
      10, 20, 30, 255,  // pixel 0: foreground
      40, 50, 60, 255,  // pixel 1: background
    ]);
    const maskAlpha = new Uint8ClampedArray([255, 0]);

    // Initial white composite
    const whiteComposite = compositeRgbaBuffer(sourceRgba, maskAlpha, width, height, "white");
    assert.deepStrictEqual(Array.from(whiteComposite.slice(0, 4)), [10, 20, 30, 255], "Pixel 0 is foreground");
    assert.deepStrictEqual(Array.from(whiteComposite.slice(4, 8)), [255, 255, 255, 255], "Pixel 1 is white background");

    // Switch to pink
    const pinkComposite = switchCompositeMode(sourceRgba, maskAlpha, width, height, "pink");
    assert.deepStrictEqual(Array.from(pinkComposite.slice(0, 4)), [10, 20, 30, 255], "Pixel 0 remains exact foreground");
    assert.deepStrictEqual(Array.from(pinkComposite.slice(4, 8)), [255, 240, 245, 255], "Pixel 1 is now pink #FFF0F5");
  });

  // ─────────────────────────────────────────────────────────────
  // 11. Pink → White mode switching
  // ─────────────────────────────────────────────────────────────
  await t.test("11. Pink → White mode switching", () => {
    const width = 2;
    const height = 1;
    const sourceRgba = new Uint8ClampedArray([
      15, 25, 35, 255,  // pixel 0: foreground
      45, 55, 65, 255,  // pixel 1: background
    ]);
    const maskAlpha = new Uint8ClampedArray([255, 0]);

    // Initial pink composite
    const pinkComposite = compositeRgbaBuffer(sourceRgba, maskAlpha, width, height, "pink");
    assert.deepStrictEqual(Array.from(pinkComposite.slice(0, 4)), [15, 25, 35, 255], "Pixel 0 is foreground");
    assert.deepStrictEqual(Array.from(pinkComposite.slice(4, 8)), [255, 240, 245, 255], "Pixel 1 is pink background");

    // Switch to white
    const whiteComposite = switchCompositeMode(sourceRgba, maskAlpha, width, height, "white");
    assert.deepStrictEqual(Array.from(whiteComposite.slice(0, 4)), [15, 25, 35, 255], "Pixel 0 remains exact foreground");
    assert.deepStrictEqual(Array.from(whiteComposite.slice(4, 8)), [255, 255, 255, 255], "Pixel 1 is now white #FFFFFF");
  });

  // ─────────────────────────────────────────────────────────────
  // Bonus: Truthful Descriptive Filename Generation
  // ─────────────────────────────────────────────────────────────
  await t.test("Descriptive export filename generation", () => {
    const fnWhite = generateExportFilename("exercise_01.jpg", "white", 1200, 1200, "final");
    assert.strictEqual(fnWhite, "PLP-exercise_01-Question-White-FFFFFF-1200x1200-final.png");

    const fnPink = generateExportFilename("solution_step2.png", "pink", 800, 600, "preview");
    assert.strictEqual(fnPink, "PLP-solution_step2-Solution-Pink-FFF0F5-800x600-preview.png");

    const fnTrans = generateExportFilename("equation_cut.webp", "transparent", 1024, 1024, "browser");
    assert.strictEqual(fnTrans, "PLP-equation_cut-Cutout-Transparent-1024x1024-browser.png");
  });
});
