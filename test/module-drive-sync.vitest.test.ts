import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { ModuleDriveSync } from "@/components/drive/ModuleDriveSync";
import { uploadImageToDrive, formatDriveFilename } from "@/lib/drive-upload-client";

describe("ModuleDriveSync Component Rendering & Structure", () => {
  it("renders read-only automatic panel with DYT_Math_Images folder and admin link without any checkbox", () => {
    const html = renderToString(
      React.createElement(ModuleDriveSync, {
        moduleName: "Module 01: Math OCR",
        status: "idle",
        uploadedRecord: null,
        errorMessage: null,
      })
    );

    // Verify Read-Only Automatic status panel
    expect(html).toContain("Google Drive Storage");
    expect(html).toContain("Automatic");
    expect(html).toContain("Folder: DYT_Math_Images");
    expect(html).toContain("Private");
    expect(html).toContain("Admin → Google Drive Storage");
    expect(html).toContain("href=\"/admin?tab=drive\"");

    // Crucial: strictly verify NO user-facing checkbox exists
    expect(html).not.toContain("type=\"checkbox\"");
    expect(html).not.toContain("កុំរក្សាទុក");
  });

  it("renders pending state with spinner when uploading", () => {
    const html = renderToString(
      React.createElement(ModuleDriveSync, {
        moduleName: "Module 03: HD Resize & Sharpen",
        status: "pending",
        uploadedRecord: null,
        errorMessage: null,
      })
    );

    expect(html).toContain("កំពុងបញ្ជូនទៅកាន់ Google Drive (Folder: DYT_Math_Images)...");
    expect(html).toContain("មិនរារាំងមុខងារ AI ឡើយ");
    expect(html).toContain("Uploading");
  });

  it("renders uploaded state with real File ID, size, and view link on success", () => {
    const html = renderToString(
      React.createElement(ModuleDriveSync, {
        moduleName: "Module 04: Khmer Math Solver",
        status: "uploaded",
        uploadedRecord: {
          id: "drive-file-id-test-12345",
          name: "module04_math_solver_dayuth_1729329482938_problem.png",
          mimeType: "image/png",
          size: 4096,
          webViewLink: "https://drive.google.com/file/d/drive-file-id-test-12345/view",
          isPublic: false,
        },
        errorMessage: null,
      })
    );

    expect(html).toContain("បានរក្សាទុកក្នុង Google Drive ដោយជោគជ័យ");
    expect(html).toContain("Folder: DYT_Math_Images");
    expect(html).toContain("drive-file-id-test-12345");
    expect(html).toContain("module04_math_solver_dayuth_1729329482938_problem.png");
    expect(html).toContain("https://drive.google.com/file/d/drive-file-id-test-12345/view");
    expect(html).toContain("KB");
  });

  it("renders multi-file output records correctly (original image + generated files)", () => {
    const records = [
      {
        id: "id-orig-111",
        name: "module01_math_ocr_dayuth_1729329482938_original.png",
        mimeType: "image/png",
        size: 20480,
        webViewLink: "https://drive.google.com/file/d/id-orig-111/view",
        isPublic: false,
      },
      {
        id: "id-latex-222",
        name: "module01_math_ocr_dayuth_1729329482938_latex.tex",
        mimeType: "application/x-tex",
        size: 512,
        webViewLink: "https://drive.google.com/file/d/id-latex-222/view",
        isPublic: false,
      },
      {
        id: "id-html-333",
        name: "module01_math_ocr_dayuth_1729329482938_preview.html",
        mimeType: "text/html",
        size: 1024,
        webViewLink: "https://drive.google.com/file/d/id-html-333/view",
        isPublic: false,
      },
    ];

    const html = renderToString(
      React.createElement(ModuleDriveSync, {
        moduleName: "Module 01: Math OCR",
        status: "uploaded",
        uploadedRecords: records,
        errorMessage: null,
      })
    );

    expect(html).toContain("ឯកសារ / Upload succeeded");
    expect(html).toContain("id-orig-111");
    expect(html).toContain("id-latex-222");
    expect(html).toContain("id-html-333");
    expect(html).toContain("module01_math_ocr_dayuth_1729329482938_latex.tex");
    expect(html).toContain("module01_math_ocr_dayuth_1729329482938_preview.html");
  });

  it("renders truthful failure warning with retry and link to Admin portal when not connected", () => {
    const html = renderToString(
      React.createElement(ModuleDriveSync, {
        moduleName: "Module 05: Lesson Studio",
        status: "failed",
        uploadedRecord: null,
        errorMessage: "Google Drive មិនទាន់ត្រូវបានភ្ជាប់ឡើយ (Google Drive not connected)",
        onRetry: () => {},
      })
    );

    expect(html).toContain("មិនអាចរក្សាទុកក្នុង Google Drive បានទេ");
    expect(html).toContain("Google Drive មិនទាន់ត្រូវបានភ្ជាប់ឡើយ");
    expect(html).toContain("ភ្ជាប់ Google Drive របស់អ្នកនៅក្នុង Admin Portal");
    expect(html).toContain("href=\"/admin?tab=drive\"");
    expect(html).toContain("សាកល្បងម្ដងទៀត (Retry)");
    expect(html).toContain("មុខងារដំណើរការរូបភាព AI នៅតែដំណើរការជោគជ័យធម្មតា");
  });
});

describe("uploadImageToDrive client helper & naming engine", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("formats standardized, readable drive filenames per specification", () => {
    const filename = formatDriveFilename({
      modulePrefix: "module01_math_ocr",
      userIdOrName: "dayuth",
      outputType: "latex",
      extension: "tex",
      timestamp: 1729329482938,
    });

    expect(filename).toBe("module01_math_ocr_dayuth_1729329482938_latex.tex");
  });

  it("sends FormData when binary file is provided", async () => {
    const fakeRecord = {
      id: "test-id-123",
      name: "test.png",
      mimeType: "image/png",
      size: 100,
      webViewLink: "https://drive.google.com/test",
      isPublic: false,
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ success: true, file: fakeRecord }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const testFile = new File(["dummy content"], "test.png", { type: "image/png" });
    const result = await uploadImageToDrive({
      file: testFile,
      filename: "custom_name.png",
      description: "Test upload",
      makePublic: false,
    });

    expect(result.id).toBe("test-id-123");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/upload-to-drive",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("sends JSON with raw text content when text/document is provided", async () => {
    const fakeRecord = {
      id: "text-id-456",
      name: "solution.txt",
      mimeType: "text/plain",
      size: 42,
      webViewLink: "https://drive.google.com/file/d/text-id-456/view",
      isPublic: false,
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ success: true, file: fakeRecord }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadImageToDrive({
      content: "ជំហានទី១៖ រកផលបូក x + y = 10",
      filename: "solution.txt",
      mimeType: "text/plain",
      moduleName: "Module 04: Khmer Math Solver",
    });

    expect(result.id).toBe("text-id-456");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/upload-to-drive",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining("ជំហានទី១"),
      })
    );
  });

  it("throws clean descriptive error when server returns failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ success: false, error: "File exceeds maximum size" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const testFile = new File(["dummy"], "large.png", { type: "image/png" });
    await expect(
      uploadImageToDrive({
        file: testFile,
        filename: "large.png",
      })
    ).rejects.toThrow("File exceeds maximum size");
  });
});
