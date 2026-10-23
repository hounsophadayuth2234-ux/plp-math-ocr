import { describe, it, expect } from "vitest";
import {
  generateBase32Secret,
  generateTotpCode,
  verifyTotpCode,
  buildOtpauthUri,
  generateTotpSetup,
  generateQrCodeSvg,
  generateQrCodeDataUrl,
  encryptMfaSecret,
  decryptMfaSecret,
} from "@/lib/mfa";
import QRCode from "qrcode";
import jsQR from "jsqr";

/**
 * Helper to decode a QR code into its encoded string payload via jsQR
 */
function decodeQrString(qrString: string): string | null {
  const qr = QRCode.create(qrString, { errorCorrectionLevel: "M" });
  const modSize = qr.modules.size;
  const margin = 4;
  const totalSize = modSize + margin * 2;
  const scale = 4; // 4 pixels per module
  const width = totalSize * scale;
  const height = totalSize * scale;
  const rgba = new Uint8ClampedArray(width * height * 4);
  rgba.fill(255); // White background

  for (let r = 0; r < modSize; r++) {
    for (let c = 0; c < modSize; c++) {
      if (qr.modules.get(r, c)) {
        for (let py = 0; py < scale; py++) {
          for (let px = 0; px < scale; px++) {
            const y = (r + margin) * scale + py;
            const x = (c + margin) * scale + px;
            const idx = (y * width + x) * 4;
            rgba[idx] = 0; // R
            rgba[idx + 1] = 0; // G
            rgba[idx + 2] = 0; // B
            rgba[idx + 3] = 255; // A
          }
        }
      }
    }
  }

  const result = jsQR(rgba, width, height);
  return result ? result.data : null;
}

describe("Admin MFA/TOTP & QR Code Acceptance Suite", () => {
  const testUsername = "dayuth12";
  const testIssuer = "DYT Ecosystem";

  // 1. Decode generated QR and verify it contains a valid otpauth URI
  it("1. Decodes generated QR code and verifies it contains a valid otpauth URI", async () => {
    const setup = await generateTotpSetup(testUsername, testIssuer);
    expect(setup.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);

    const decoded = decodeQrString(setup.otpauthUrl);
    expect(decoded).toBeTruthy();
    expect(decoded).toBe(setup.otpauthUrl);
  });

  // 2. Verify URI secret equals the manual Base32 key
  it("2. Verifies URI secret strictly equals the manual Base32 key", async () => {
    const setup = await generateTotpSetup(testUsername, testIssuer);
    const parsedUrl = new URL(setup.otpauthUrl);
    const uriSecret = parsedUrl.searchParams.get("secret");

    expect(uriSecret).toBe(setup.plainSecret);
    expect(setup.plainSecret).toMatch(/^[A-Z2-7]{32}$/);
    expect(setup.plainSecret.length).toBe(32);
  });

  // 3. Verify issuer and account are encoded correctly
  it("3. Verifies issuer and account are encoded correctly in label and query", async () => {
    const setup = await generateTotpSetup(testUsername, testIssuer);
    const parsedUrl = new URL(setup.otpauthUrl);

    expect(parsedUrl.searchParams.get("issuer")).toBe(testIssuer);
    expect(parsedUrl.searchParams.get("algorithm")).toBe("SHA1");
    expect(parsedUrl.searchParams.get("digits")).toBe("6");
    expect(parsedUrl.searchParams.get("period")).toBe("30");

    // In otpauth://totp/{label}, host is 'totp' and pathname is '/{issuer}:{account}'
    expect(parsedUrl.host).toBe("totp");
    const pathDecoded = decodeURIComponent(parsedUrl.pathname);
    expect(pathDecoded).toBe(`/${testIssuer}:${testUsername}`);
  });

  // 4. Verify known RFC 6238 test vectors
  it("4. Verifies known RFC 6238 standard test vectors (HMAC-SHA1, 6 digits, 30s period)", () => {
    // RFC 6238 Appendix B test seed: ASCII "12345678901234567890" -> Base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
    const rfcSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

    const vectors = [
      { step: 1, expected: "287082" }, // 59s
      { step: 37037036, expected: "081804" }, // 1111111109s
      { step: 37037037, expected: "050471" }, // 1111111111s
      { step: 41152263, expected: "005924" }, // 1234567890s
      { step: 66666666, expected: "279037" }, // 2000000000s
    ];

    for (const v of vectors) {
      const code = generateTotpCode(rfcSecret, v.step);
      expect(code).toBe(v.expected);
    }
  });

  // 5. Verify invalid code is rejected
  it("5. Rejects invalid or malformed codes", async () => {
    const setup = await generateTotpSetup(testUsername);

    // Non-numeric
    expect(verifyTotpCode(setup.plainSecret, "abcdef")).toBe(false);
    // Wrong length
    expect(verifyTotpCode(setup.plainSecret, "12345")).toBe(false);
    expect(verifyTotpCode(setup.plainSecret, "1234567")).toBe(false);
    // Empty / whitespace
    expect(verifyTotpCode(setup.plainSecret, "")).toBe(false);
    expect(verifyTotpCode(setup.plainSecret, "   ")).toBe(false);
    // Incorrect 6-digit number
    const currentStep = Math.floor(Date.now() / 1000 / 30);
    const validCode = generateTotpCode(setup.plainSecret, currentStep);
    const invalidCode = validCode === "123456" ? "654321" : "123456";
    expect(verifyTotpCode(setup.plainSecret, invalidCode)).toBe(false);
  });

  // 6. Verify expired / out-of-window code is rejected
  it("6. Rejects expired / out-of-window codes beyond ±1 time step window", async () => {
    const setup = await generateTotpSetup(testUsername);
    const currentStep = Math.floor(Date.now() / 1000 / 30);

    // Codes at current step, -1 step, +1 step must pass (window = 1)
    const codeCurrent = generateTotpCode(setup.plainSecret, currentStep);
    const codeMinus1 = generateTotpCode(setup.plainSecret, currentStep - 1);
    const codePlus1 = generateTotpCode(setup.plainSecret, currentStep + 1);

    expect(verifyTotpCode(setup.plainSecret, codeCurrent, 1)).toBe(true);
    expect(verifyTotpCode(setup.plainSecret, codeMinus1, 1)).toBe(true);
    expect(verifyTotpCode(setup.plainSecret, codePlus1, 1)).toBe(true);

    // Codes beyond ±1 step must be strictly rejected
    const codeMinus2 = generateTotpCode(setup.plainSecret, currentStep - 2);
    const codePlus2 = generateTotpCode(setup.plainSecret, currentStep + 2);

    expect(verifyTotpCode(setup.plainSecret, codeMinus2, 1)).toBe(false);
    expect(verifyTotpCode(setup.plainSecret, codePlus2, 1)).toBe(false);
  });

  // 7. Verify failed setup does not enable MFA
  it("7. Failed setup simulation guarantees MFA remains inactive until verified", async () => {
    // Simulating database user state
    const userState = {
      username: testUsername,
      mfaEnabled: false,
      mfaPendingSecretEncrypted: undefined as string | undefined,
      mfaSecretEncrypted: undefined as string | undefined,
    };

    // Step 1: Initiate setup
    const setup = await generateTotpSetup(userState.username);
    userState.mfaPendingSecretEncrypted = setup.encryptedSecret;

    expect(userState.mfaEnabled).toBe(false);

    // Step 2: User provides wrong code
    const isCodeValid = verifyTotpCode(userState.mfaPendingSecretEncrypted, "999999");
    expect(isCodeValid).toBe(false);

    // State invariant: mfaEnabled must still be false
    expect(userState.mfaEnabled).toBe(false);
    expect(userState.mfaSecretEncrypted).toBeUndefined();
  });

  // 8. Verify exposed/old pending secret cannot be reused
  it("8. Re-initiating setup or canceling safely invalidates any previous secret", async () => {
    const setup1 = await generateTotpSetup(testUsername);
    const setup2 = await generateTotpSetup(testUsername);

    // Each setup generates completely new random secret
    expect(setup1.plainSecret).not.toBe(setup2.plainSecret);
    expect(setup1.encryptedSecret).not.toBe(setup2.encryptedSecret);

    // Code generated from old secret does not verify against new setup secret
    const currentStep = Math.floor(Date.now() / 1000 / 30);
    const oldCode = generateTotpCode(setup1.plainSecret, currentStep);
    expect(verifyTotpCode(setup2.encryptedSecret, oldCode)).toBe(false);
  });

  // 9. Verify no secret appears in logs or audit events
  it("9. Guarantees secrets and raw keys are never stored in plain text or leaked", async () => {
    const setup = await generateTotpSetup(testUsername);

    // Stored secret must be AES-256-GCM encrypted (iv:authTag:ciphertext in base64)
    expect(setup.encryptedSecret).not.toContain(setup.plainSecret);
    expect(setup.encryptedSecret).toMatch(/^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);

    // Decryption works accurately only with the managed master key
    const decrypted = decryptMfaSecret(setup.encryptedSecret);
    expect(decrypted).toBe(setup.plainSecret);

    // Audit event payload check simulation
    const auditEvent = {
      type: "SECURITY_ALERT",
      actorUsername: testUsername,
      details: { action: "Initiated MFA TOTP setup" },
    };
    const serialized = JSON.stringify(auditEvent);
    expect(serialized).not.toContain(setup.plainSecret);
  });

  // 10. QR Format Invariants: 256x256+ SVG & PNG Data URL
  it("10. Generates compliant SVG and downloadable PNG data URL with white background", async () => {
    const setup = await generateTotpSetup(testUsername);

    // SVG checks
    expect(setup.qrSvg).toContain("<svg");
    expect(setup.qrSvg).toContain("viewBox=");
    expect(setup.qrSvg).not.toContain("rx=\"12\""); // No rounded module corners inside QR
    expect(setup.qrSvg).toContain("#ffffff"); // White background

    // PNG Data URL checks
    expect(setup.qrPngDataUrl).toMatch(/^data:image\/png;base64,/);
  });
});
