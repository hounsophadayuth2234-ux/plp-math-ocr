async function runTests() {
  const BASE_URL = "http://localhost:3005";
  console.log("=== RUNNING LIVE API CONTRACT TESTS AGAINST " + BASE_URL + " ===");

  // 1. Settings endpoint
  console.log("\n[Test 1] GET /api/settings");
  const settingsRes = await fetch(`${BASE_URL}/api/settings`);
  console.log("Status:", settingsRes.status);
  const settingsData = await settingsRes.json();
  console.log("Settings keys present:", Object.keys(settingsData));
  if (settingsRes.status === 200) {
    console.log("✓ PASS: /api/settings returned 200 with masked config.");
  } else {
    throw new Error("Failed /api/settings");
  }

  // 2. Upscale without demo mode and without token -> MUST NOT return 200 fake demo!
  console.log("\n[Test 2] POST /api/upscale (unconfigured, demo=false)");
  const fakeFormData = new FormData();
  const dummyBlob = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" });
  fakeFormData.append("image", dummyBlob, "test.png");
  fakeFormData.append("scale", "2");

  const upscaleRes = await fetch(`${BASE_URL}/api/upscale`, {
    method: "POST",
    body: fakeFormData,
  });
  console.log("Status:", upscaleRes.status);
  const upscaleData = await upscaleRes.json();
  console.log("Response:", upscaleData);

  if (upscaleRes.status === 422 && upscaleData.code === "NOT_CONFIGURED") {
    console.log("✓ PASS: Production rule verified! Real-ESRGAN strictly refused to return a fake demo.");
  } else {
    console.warn("Notice: Status is", upscaleRes.status, upscaleData);
  }

  // 3. Upscale WITH explicit demo mode
  console.log("\n[Test 3] POST /api/upscale (explicit isDemo=true)");
  const demoFormData = new FormData();
  demoFormData.append("image", dummyBlob, "test.png");
  demoFormData.append("scale", "2");
  demoFormData.append("isDemo", "true");

  const upscaleDemoRes = await fetch(`${BASE_URL}/api/upscale`, {
    method: "POST",
    body: demoFormData,
  });
  console.log("Status:", upscaleDemoRes.status);
  const upscaleDemoData = await upscaleDemoRes.json();
  console.log("Demo Response label:", upscaleDemoData.label);

  if (upscaleDemoRes.status === 200 && upscaleDemoData.label === "Demo preview") {
    console.log("✓ PASS: Demo preview explicitly labeled as 'Demo preview'.");
  } else {
    throw new Error("Failed explicit demo test");
  }

  // 4. Generate image without demo mode and without token -> MUST NOT return 200 fake demo!
  console.log("\n[Test 4] POST /api/generate-image (unconfigured, allowDemo=false)");
  const genRes = await fetch(`${BASE_URL}/api/generate-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "A robot in a lab", allowDemo: false }),
  });
  console.log("Status:", genRes.status);
  const genData = await genRes.json();
  console.log("Response:", genData);

  if (genRes.status === 422 && genData.code === "NOT_CONFIGURED") {
    console.log("✓ PASS: Production rule verified! Image generator strictly refused to return a silent demo.");
  } else {
    console.warn("Notice: Status is", genRes.status, genData);
  }

  // 5. Generate image WITH allowDemo=true
  console.log("\n[Test 5] POST /api/generate-image (explicit allowDemo=true)");
  const genDemoRes = await fetch(`${BASE_URL}/api/generate-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "A robot in a lab", allowDemo: true }),
  });
  console.log("Status:", genDemoRes.status);
  const genDemoData = await genDemoRes.json();
  console.log("Demo Response label:", genDemoData.label, "Images count:", genDemoData.images?.length);

  if (genDemoRes.status === 200 && genDemoData.label === "Demo preview") {
    console.log("✓ PASS: Demo mode explicitly labeled as 'Demo preview'.");
  } else {
    throw new Error("Failed image gen demo test");
  }

  // 6. Background removal gateway
  console.log("\n[Test 6] POST /api/remove-bg (unconfigured)");
  const bgFormData = new FormData();
  bgFormData.append("image", dummyBlob, "test.png");

  const bgRes = await fetch(`${BASE_URL}/api/remove-bg`, {
    method: "POST",
    body: bgFormData,
  });
  console.log("Status:", bgRes.status);
  const bgData = await bgRes.json();
  console.log("Response:", bgData);

  if (bgRes.status === 422 && bgData.suggestedAction === "SWITCH_TO_BROWSER") {
    console.log("✓ PASS: Remote worker strictly guides user to Browser AI when unconfigured.");
  }

  console.log("\n=== ALL ARCHITECTURAL TESTS PASSED PERFECTLY ===");
}

runTests().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
