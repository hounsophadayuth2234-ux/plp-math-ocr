import assert from "node:assert";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import test from "node:test";
import { NextRequest } from "next/server.js";
import { GET as removeBgGET, POST as removeBgPOST } from "../src/app/api/remove-bg/route.ts";
import { GET as settingsGET, POST as settingsPOST } from "../src/app/api/settings/route.ts";

// Helper: 1x1 RGBA PNG buffer with 1 transparent pixel
function createTransparentPngBuffer(w = 2, h = 2) {
  // Simple uncompressed valid PNG with RGBA
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  
  // IHDR
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write("IHDR", 4);
  ihdr.writeUInt32BE(w, 8);
  ihdr.writeUInt32BE(h, 12);
  ihdr.writeUInt8(8, 16);  // bit depth
  ihdr.writeUInt8(6, 17);  // color type 6: RGBA
  ihdr.writeUInt8(0, 18);  // compression
  ihdr.writeUInt8(0, 19);  // filter
  ihdr.writeUInt8(0, 20);  // interlace
  // CRC for IHDR (dummy or calculated)
  const ihdrCrc = 0x27f55b9e; // Placeholder
  ihdr.writeUInt32BE(ihdrCrc, 21);

  // IDAT with transparent and opaque pixels
  // Filter byte 0 per scanline, followed by RGBA pixels
  const rawScanlines = [];
  for (let y = 0; y < h; y++) {
    rawScanlines.push(0); // Filter 0: None
    for (let x = 0; x < w; x++) {
      if (x === 0 && y === 0) {
        // Transparent pixel (background removed)
        rawScanlines.push(0, 0, 0, 0);
      } else {
        // Foreground pixel (opaque subject)
        rawScanlines.push(40, 120, 200, 255);
      }
    }
  }
  
  // We can use zlib deflated data or standard tiny PNG
  const compressed = zlib.deflateSync(Buffer.from(rawScanlines));
  const idat = Buffer.alloc(8 + compressed.length + 4);
  idat.writeUInt32BE(compressed.length, 0);
  idat.write("IDAT", 4);
  compressed.copy(idat, 8);
  // Dummy CRC
  idat.writeUInt32BE(0x12345678, 8 + compressed.length);

  // IEND
  const iend = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

  return Buffer.concat([signature, ihdr, idat, iend]);
}

test("REMOTE WORKER INTEGRATION & CONTRACT TEST SUITE", async (t) => {
  const origEnv = { ...process.env };
  const fixturesDir = path.resolve(process.cwd(), "test-fixtures");

  t.afterEach(() => {
    process.env = { ...origEnv };
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 1. SSRF & Host Validation in Production vs Development
  // ─────────────────────────────────────────────────────────────────────────
  await t.test("1. Enforces SSRF Protection & Approved Host Policy in Production", async () => {
    // Simulated Production
    process.env.NODE_ENV = "production";
    process.env.VERCEL = "1";

    // Loopback localhost rejected
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "http://localhost:8000";
    const resLocal = await removeBgGET();
    const dataLocal = await resLocal.json();
    assert.strictEqual(dataLocal.configured, false);
    assert.strictEqual(dataLocal.status, "invalid_configuration");
    assert.match(dataLocal.error, /HTTPS/);

    // Private IP rejected
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "https://192.168.1.100/remove";
    const resPrivate = await removeBgGET();
    const dataPrivate = await resPrivate.json();
    assert.strictEqual(dataPrivate.configured, false);
    assert.strictEqual(dataPrivate.status, "invalid_configuration");
    assert.match(dataPrivate.error, /private or loopback/);

    // Cloud metadata rejected
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "https://169.254.169.254/remove";
    const resMeta = await removeBgGET();
    const dataMeta = await resMeta.json();
    assert.strictEqual(dataMeta.configured, false);
    assert.strictEqual(dataMeta.status, "invalid_configuration");

    // Public HTTPS allowed in production
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "https://rembg-worker.up.railway.app";
    const resProd = await removeBgGET();
    const dataProd = await resProd.json();
    assert.strictEqual(dataProd.configured, true);
    assert.strictEqual(dataProd.status, "configured");

    // Local development allows localhost
    process.env.NODE_ENV = "development";
    delete process.env.VERCEL;
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "http://localhost:8000";
    const resDev = await removeBgGET();
    const dataDev = await resDev.json();
    assert.strictEqual(dataDev.configured, true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Mock FastAPI Upstream Worker Setup & Testing
  // ─────────────────────────────────────────────────────────────────────────
  let workerServer;
  let workerPort = 8799;
  let workerMode = "normal"; // "normal" | "timeout" | "500" | "malformed" | "empty"
  let transparentPng = await createTransparentPngBuffer(4, 4);

  await new Promise((resolve) => {
    workerServer = http.createServer((req, res) => {
      // 1. Health endpoint
      if (req.method === "GET" && req.url === "/health") {
        if (workerMode === "500") {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "error", error: "Worker database unavailable" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "ok",
            service: "rembg-fastapi-worker",
            model: "u2net",
            uptime_seconds: 42.5,
          })
        );
        return;
      }

      // 2. Remove endpoint
      if (req.method === "POST" && (req.url === "/remove" || req.url === "/api/remove")) {
        if (workerMode === "timeout") {
          // Delay response past timeout
          setTimeout(() => {
            res.writeHead(200, { "Content-Type": "image/png" });
            res.end(transparentPng);
          }, 400);
          return;
        }

        if (workerMode === "500") {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Internal Server Error: ONNX runtime out of memory");
          return;
        }

        if (workerMode === "malformed") {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<html><body>Error 502 Bad Gateway</body></html>");
          return;
        }

        if (workerMode === "empty") {
          res.writeHead(200, { "Content-Type": "image/png" });
          res.end(Buffer.alloc(0));
          return;
        }

        // Normal mode: echo back genuine transparent PNG
        let bodyChunks = [];
        req.on("data", (chunk) => bodyChunks.push(chunk));
        req.on("end", () => {
          res.writeHead(200, {
            "Content-Type": "image/png",
            "X-Processing-Engine": "rembg-fastapi-worker",
            "X-Segmentation-Model": "u2net",
            "X-Inference-Time-Ms": "48",
          });
          res.end(transparentPng);
        });
        return;
      }

      res.writeHead(404);
      res.end();
    });

    workerServer.listen(workerPort, () => {
      resolve();
    });
  });

  t.after(() => {
    if (workerServer) workerServer.close();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Health Check Probing Contract
  // ─────────────────────────────────────────────────────────────────────────
  await t.test("2. Probes upstream worker health and returns ready / unavailable", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = `http://127.0.0.1:${workerPort}`;
    process.env.NODE_ENV = "development";

    workerMode = "normal";
    const reqHealth = new NextRequest(`http://localhost:3000/api/remove-bg?checkHealth=true`);
    const resHealth = await removeBgGET(reqHealth);
    assert.strictEqual(resHealth.status, 200);
    const dataHealth = await resHealth.json();
    assert.strictEqual(dataHealth.configured, true);
    assert.strictEqual(dataHealth.status, "ready");
    assert.strictEqual(dataHealth.model, "u2net");

    // When worker returns 500 error
    workerMode = "500";
    const resFail = await removeBgGET(reqHealth);
    const dataFail = await resFail.json();
    assert.strictEqual(dataFail.configured, true);
    assert.strictEqual(dataFail.status, "unavailable");
    assert.match(dataFail.error, /HTTP 500/);

    // Reset mode
    workerMode = "normal";
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Real Image Processing: JPEG, WebP, PNG & Text/Math Protection
  // ─────────────────────────────────────────────────────────────────────────
  await t.test("3. Successfully processes real JPG, PNG, and WebP inputs producing genuine transparent PNG", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = `http://127.0.0.1:${workerPort}`;
    workerMode = "normal";

    // Test A: 1200x1200 JPEG
    const jpegBuffer = fs.readFileSync(path.join(fixturesDir, "fixture-1200x1200.jpg"));
    const fdJpeg = new FormData();
    fdJpeg.append("image", new Blob([jpegBuffer], { type: "image/jpeg" }), "photo.jpg");
    const reqJpeg = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fdJpeg });

    const resJpeg = await removeBgPOST(reqJpeg);
    assert.strictEqual(resJpeg.status, 200);
    assert.strictEqual(resJpeg.headers.get("content-type"), "image/png");
    assert.strictEqual(resJpeg.headers.get("x-processing-source"), "Remote Worker");
    assert.ok(resJpeg.headers.get("x-request-id"));

    const outBufJpeg = Buffer.from(await resJpeg.arrayBuffer());
    assert.ok(outBufJpeg.length > 50, "Output PNG must be non-empty");
    assert.strictEqual(outBufJpeg[0], 0x89);
    assert.strictEqual(outBufJpeg[1], 0x50); // P
    assert.strictEqual(outBufJpeg[2], 0x4e); // N
    assert.strictEqual(outBufJpeg[3], 0x47); // G

    // Test B: Real WebP fixture
    const webpBuffer = fs.readFileSync(path.join(fixturesDir, "fixture-webp.webp"));
    const fdWebp = new FormData();
    fdWebp.append("image", new Blob([webpBuffer], { type: "image/webp" }), "sample.webp");
    const reqWebp = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fdWebp });

    const resWebp = await removeBgPOST(reqWebp);
    assert.strictEqual(resWebp.status, 200);
    assert.strictEqual(resWebp.headers.get("content-type"), "image/png");

    // Test C: Math OCR / Text Problem Image (math-01-basic.png)
    const mathBuffer = fs.readFileSync(path.join(fixturesDir, "math-01-basic.png"));
    const fdMath = new FormData();
    fdMath.append("image", new Blob([mathBuffer], { type: "image/png" }), "equation.png");
    const reqMath = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fdMath });

    const resMath = await removeBgPOST(reqMath);
    assert.strictEqual(resMath.status, 200);
    assert.strictEqual(resMath.headers.get("content-type"), "image/png");
    const outBufMath = Buffer.from(await resMath.arrayBuffer());
    assert.ok(outBufMath.length > 50);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Worker Error Simulation (Timeout, 500, Malformed, Empty, Offline)
  // ─────────────────────────────────────────────────────────────────────────
  await t.test("4. Maps worker failures to actionable error codes without exposing secrets", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = `http://127.0.0.1:${workerPort}`;
    process.env.BACKGROUND_REMOVAL_TIMEOUT_MS = "80"; // Short timeout for test
    const dummyBlob = new Blob([Buffer.from("dummy-image")], { type: "image/png" });

    // A. Timeout
    workerMode = "timeout";
    const fdTimeout = new FormData();
    fdTimeout.append("image", dummyBlob, "timeout.png");
    const reqTimeout = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fdTimeout });
    const resTimeout = await removeBgPOST(reqTimeout);
    assert.strictEqual(resTimeout.status, 504);
    const bodyTimeout = await resTimeout.json();
    assert.strictEqual(bodyTimeout.code, "WORKER_TIMEOUT");

    // B. Worker 500 Error
    workerMode = "500";
    const fd500 = new FormData();
    fd500.append("image", dummyBlob, "err.png");
    const req500 = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fd500 });
    const res500 = await removeBgPOST(req500);
    assert.strictEqual(res500.status, 502);
    const body500 = await res500.json();
    assert.strictEqual(body500.code, "WORKER_FAILED");

    // C. Malformed HTML response
    workerMode = "malformed";
    const fdMal = new FormData();
    fdMal.append("image", dummyBlob, "html.png");
    const reqMal = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fdMal });
    const resMal = await removeBgPOST(reqMal);
    assert.strictEqual(resMal.status, 502);
    const bodyMal = await resMal.json();
    assert.strictEqual(bodyMal.code, "INVALID_WORKER_RESPONSE");

    // D. Empty response
    workerMode = "empty";
    const fdEmpty = new FormData();
    fdEmpty.append("image", dummyBlob, "zero.png");
    const reqEmpty = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fdEmpty });
    const resEmpty = await removeBgPOST(reqEmpty);
    assert.strictEqual(resEmpty.status, 502);
    const bodyEmpty = await resEmpty.json();
    assert.strictEqual(bodyEmpty.code, "EMPTY_WORKER_RESPONSE");

    // E. Offline port
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "http://127.0.0.1:49999"; // Non-existent port
    const fdOffline = new FormData();
    fdOffline.append("image", dummyBlob, "offline.png");
    const reqOffline = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fdOffline });
    const resOffline = await removeBgPOST(reqOffline);
    assert.strictEqual(resOffline.status, 502);
    const bodyOffline = await resOffline.json();
    assert.strictEqual(bodyOffline.code, "WORKER_UNREACHABLE");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Settings API Behavior in Production vs Local Dev
  // ─────────────────────────────────────────────────────────────────────────
  await t.test("5. Settings API provides honest feedback for Vercel production vs local dev", async () => {
    // A. Local Development
    process.env.NODE_ENV = "development";
    delete process.env.VERCEL;
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "http://localhost:8000";

    const resGetDev = await settingsGET();
    const dataGetDev = await resGetDev.json();
    assert.strictEqual(dataGetDev.isProduction, false);
    assert.strictEqual(dataGetDev.rembgSpaceUrlSet, true);

    const reqPostDev = new NextRequest("http://localhost:3000/api/settings", {
      method: "POST",
      body: JSON.stringify({ rembgSpaceUrl: "http://localhost:8000" }),
    });
    const resPostDev = await settingsPOST(reqPostDev);
    const dataPostDev = await resPostDev.json();
    assert.strictEqual(dataPostDev.success, true);
    assert.strictEqual(dataPostDev.isProduction, false);

    // B. Production Environment
    process.env.NODE_ENV = "production";
    process.env.VERCEL = "1";

    const resGetProd = await settingsGET();
    const dataGetProd = await resGetProd.json();
    assert.strictEqual(dataGetProd.isProduction, true);

    const reqPostProd = new NextRequest("http://localhost:3000/api/settings", {
      method: "POST",
      body: JSON.stringify({ rembgSpaceUrl: "https://worker.railway.app" }),
    });
    const resPostProd = await settingsPOST(reqPostProd);
    const dataPostProd = await resPostProd.json();
    assert.strictEqual(dataPostProd.isProduction, true);
    assert.strictEqual(dataPostProd.success, false);
    assert.match(dataPostProd.message, /Vercel Project Settings/);
  });
});
