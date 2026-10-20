import { describe, it, expect } from "vitest";
import {
  validateImageUpload,
  sanitizeFilename,
} from "@/lib/image-upload-validator";

// Helper: 1x1 valid PNG binary buffer
function createValidPngBuffer(width = 1, height = 1): Uint8Array {
  const buf = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG Signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk length & type
    0x00, 0x00, 0x00, 0x00, // Width (to be set)
    0x00, 0x00, 0x00, 0x00, // Height (to be set)
    0x08, 0x06, 0x00, 0x00, 0x00, // bit depth, color type, compression, filter, interlace
    0x1f, 0x15, 0xc4, 0x89, // CRC
    0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, // IDAT
    0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01,
    0x0d, 0x0a, 0x2d, 0xb4,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82, // IEND
  ]);
  const view = new DataView(buf.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return buf;
}

// Helper: Minimal valid JPEG binary buffer with SOF0 marker
function createValidJpegBuffer(width = 10, height = 10): Uint8Array {
  const buf = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, // SOI, APP0
    0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00,
    0xff, 0xc0, // SOF0 (Start of Frame)
    0x00, 0x11, // Length (17 bytes)
    0x08, // Precision
    (height >> 8) & 0xff, height & 0xff, // Height
    (width >> 8) & 0xff, width & 0xff,   // Width
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9, // EOI
  ]);
  return buf;
}

// Helper: Minimal valid WebP binary buffer (VP8 lossy)
function createValidWebpBuffer(width = 20, height = 20): Uint8Array {
  const buf = new Uint8Array(34);
  // RIFF header
  buf[0] = 0x52; buf[1] = 0x49; buf[2] = 0x46; buf[3] = 0x46;
  // File size
  buf[4] = 0x1a; buf[5] = 0x00; buf[6] = 0x00; buf[7] = 0x00;
  // WEBP
  buf[8] = 0x57; buf[9] = 0x45; buf[10] = 0x42; buf[11] = 0x50;
  // VP8 chunk
  buf[12] = 0x56; buf[13] = 0x50; buf[14] = 0x38; buf[15] = 0x20;
  buf[16] = 0x0e; buf[17] = 0x00; buf[18] = 0x00; buf[19] = 0x00;
  // VP8 keyframe start code
  buf[20] = 0x00; buf[21] = 0x00; buf[22] = 0x00;
  buf[23] = 0x9d; buf[24] = 0x01; buf[25] = 0x2a;
  // 16-bit width and height (lower 14 bits)
  buf[26] = width & 0xff;
  buf[27] = (width >> 8) & 0x3f;
  buf[28] = height & 0xff;
  buf[29] = (height >> 8) & 0x3f;
  return buf;
}

describe("Phase 2: Image Upload Validator", () => {
  describe("Valid Formats & Binary Signatures", () => {
    it("accepts a valid PNG and extracts exact dimensions", () => {
      const png = createValidPngBuffer(800, 600);
      const res = validateImageUpload(png, "sample.png");

      expect(res.valid).toBe(true);
      if (res.valid) {
        expect(res.format).toBe("image/png");
        expect(res.extension).toBe("png");
        expect(res.width).toBe(800);
        expect(res.height).toBe(600);
        expect(res.totalPixels).toBe(480000);
        expect(res.sanitizedFilename).toBe("sample.png");
      }
    });

    it("accepts a valid JPEG and extracts exact dimensions", () => {
      const jpeg = createValidJpegBuffer(1920, 1080);
      const res = validateImageUpload(jpeg, "photo.jpg");

      expect(res.valid).toBe(true);
      if (res.valid) {
        expect(res.format).toBe("image/jpeg");
        expect(res.extension).toBe("jpg");
        expect(res.width).toBe(1920);
        expect(res.height).toBe(1080);
        expect(res.totalPixels).toBe(2073600);
      }
    });

    it("accepts a valid WebP and extracts exact dimensions", () => {
      const webp = createValidWebpBuffer(640, 480);
      const res = validateImageUpload(webp, "sticker.webp");

      expect(res.valid).toBe(true);
      if (res.valid) {
        expect(res.format).toBe("image/webp");
        expect(res.extension).toBe("webp");
        expect(res.width).toBe(640);
        expect(res.height).toBe(480);
      }
    });
  });

  describe("Rejection of Invalid & Corrupted Headers", () => {
    it("rejects 0-byte empty file", () => {
      const res = validateImageUpload(new Uint8Array(0));
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.code).toBe("EMPTY_FILE");
        expect(res.httpStatus).toBe(400);
      }
    });

    it("rejects random ASCII text disguised as an image", () => {
      const text = new TextEncoder().encode("Hello World, I am a fake image");
      const res = validateImageUpload(text, "fake.png");

      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.code).toBe("UNSUPPORTED_MEDIA_TYPE");
        expect(res.httpStatus).toBe(415);
      }
    });

    it("rejects corrupted PNG header with invalid magic bytes", () => {
      const corrupt = createValidPngBuffer(10, 10);
      corrupt[0] = 0x00; // corrupt signature byte
      const res = validateImageUpload(corrupt);

      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.code).toBe("UNSUPPORTED_MEDIA_TYPE");
        expect(res.httpStatus).toBe(415);
      }
    });

    it("rejects truncated JPEG file with missing SOF markers", () => {
      const truncated = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02]);
      const res = validateImageUpload(truncated);

      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.code).toBe("UNSUPPORTED_MEDIA_TYPE");
        expect(res.httpStatus).toBe(415);
      }
    });

    it("rejects Windows PE executable ('MZ' header)", () => {
      const mzHeader = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
      const res = validateImageUpload(mzHeader, "exploit.exe.png");

      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.code).toBe("DANGEROUS_CONTENT_DETECTED");
        expect(res.httpStatus).toBe(415);
      }
    });
  });

  describe("Rejection of Dangerous SVG and Script Injection", () => {
    it("strictly rejects plain SVG upload", () => {
      const svg = new TextEncoder().encode("<svg xmlns=\"http://www.w3.org/2000/svg\"><circle r=\"10\"/></svg>");
      const res = validateImageUpload(svg, "vector.svg");

      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.code).toBe("DANGEROUS_CONTENT_DETECTED");
        expect(res.httpStatus).toBe(415);
      }
    });

    it("strictly rejects SVG disguised as PNG extension", () => {
      const svgPolyglot = new TextEncoder().encode("<?xml version=\"1.0\"?><svg><script>alert(1)</script></svg>");
      const res = validateImageUpload(svgPolyglot, "innocent.png");

      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.code).toBe("DANGEROUS_CONTENT_DETECTED");
        expect(res.httpStatus).toBe(415);
      }
    });

    it("strictly rejects HTML with embedded onload/script event handlers", () => {
      const htmlPayload = new TextEncoder().encode("<html><img src=x onerror=alert(1)></html>");
      const res = validateImageUpload(htmlPayload, "test.jpg");

      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.code).toBe("DANGEROUS_CONTENT_DETECTED");
        expect(res.httpStatus).toBe(415);
      }
    });
  });

  describe("Dimension & Pixel Count Ceiling Enforcement", () => {
    it("rejects image exceeding 4096 px width limit", () => {
      const oversizedWidth = createValidPngBuffer(4097, 100);
      const res = validateImageUpload(oversizedWidth);

      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.code).toBe("DIMENSIONS_TOO_LARGE");
        expect(res.error).toContain("4097");
        expect(res.httpStatus).toBe(400);
      }
    });

    it("rejects image exceeding 4096 px height limit", () => {
      const oversizedHeight = createValidPngBuffer(100, 4097);
      const res = validateImageUpload(oversizedHeight);

      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.code).toBe("DIMENSIONS_TOO_LARGE");
        expect(res.error).toContain("4097");
        expect(res.httpStatus).toBe(400);
      }
    });

    it("rejects decompression bomb exceeding 16 MP pixel ceiling", () => {
      // 4096 * 4097 = 16,781,312 pixels (> 16,777,216 max)
      const bomb = createValidPngBuffer(4000, 4200); // 16.8 MP
      const res = validateImageUpload(bomb, "large.png", { maxWidth: 5000, maxHeight: 5000 });

      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.code).toBe("PIXEL_LIMIT_EXCEEDED");
        expect(res.error).toContain("MP");
        expect(res.httpStatus).toBe(400);
      }
    });

    it("accepts image exactly within 4096x4096 bounds and 16 MP", () => {
      const withinBounds = createValidPngBuffer(4000, 4000); // 16 MP exactly
      const res = validateImageUpload(withinBounds);
      expect(res.valid).toBe(true);
    });
  });

  describe("File Size Limit Enforcement", () => {
    it("rejects payload exceeding maxSizeBytes", () => {
      const png = createValidPngBuffer(10, 10);
      const res = validateImageUpload(png, "test.png", { maxSizeBytes: 30 }); // buffer is ~67 bytes

      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.code).toBe("PAYLOAD_TOO_LARGE");
        expect(res.httpStatus).toBe(413);
      }
    });
  });

  describe("Filename Sanitization & Path Traversal Prevention", () => {
    it("strips relative UNIX directory traversal", () => {
      const sanitized = sanitizeFilename("../../../etc/passwd");
      expect(sanitized).toBe("passwd");
      expect(sanitized).not.toContain("/");
      expect(sanitized).not.toContain("..");
    });

    it("strips Windows path traversal and drive letters", () => {
      const sanitized = sanitizeFilename("..\\..\\Windows\\System32\\cmd.exe");
      expect(sanitized).toBe("cmd.exe");
      expect(sanitized).not.toContain("\\");
      expect(sanitized).not.toContain("..");
    });

    it("strips control characters, null bytes, and non-printable characters", () => {
      const sanitized = sanitizeFilename("photo\x00\x1f\x7ftest.png");
      expect(sanitized).toBe("phototest.png");
    });

    it("replaces special dangerous shell characters with underscores", () => {
      const sanitized = sanitizeFilename("my;rm -rf;photo$.png");
      expect(sanitized).toBe("my_rm_-rf_photo_.png");
    });

    it("generates safe fallback filename if input is empty or null", () => {
      const sanitized = sanitizeFilename(null);
      expect(sanitized).toMatch(/^upload_\d+\.png$/);
    });
  });
});
