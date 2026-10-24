import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { ModuleDriveSync } from "@/components/drive/ModuleDriveSync";
import { uploadImageToDrive } from "@/lib/drive-upload-client";

describe("ModuleDriveSync Component Rendering & Structure", () => {
  it("renders with default disabled state", () => {
    const html = renderToString(
      React.createElement(ModuleDriveSync, {
        moduleName: "Module 01: Math OCR",
        saveToDrive: false,
        onToggleSave: () => {},
        status: "idle",
        uploadedRecord: null,
        errorMessage: null,
      })
    );

    expect(html).toContain("Google Drive Storage");
    expect(html).toContain("កុំរក្សាទុក");
    expect(html).toContain("Private");
    expect(html).toContain("Drive saving disabled");
  });

  it("renders enabled idle state when saveToDrive is true", () => {
    const html = renderToString(
      React.createElement(ModuleDriveSync, {
        moduleName: "Module 02: Background Remover",
        saveToDrive: true,
        onToggleSave: () => {},
        status: "idle",
        uploadedRecord: null,
        errorMessage: null,
      })
    );

    expect(html).toContain("រក្សាទុកក្នុង Drive (Enabled)");
    expect(html).toContain("Ready to save upon processing");
  });

  it("renders pending state with spinner when uploading", () => {
    const html = renderToString(
      React.createElement(ModuleDriveSync, {
        moduleName: "Module 03: HD Resize & Sharpen",
        saveToDrive: true,
        onToggleSave: () => {},
        status: "pending",
        uploadedRecord: null,
        errorMessage: null,
      })
    );

    expect(html).toContain("កំពុងបញ្ជូនទៅកាន់ Google Drive");
    expect(html).toContain("មិនរារាំងមុខងារ AI ឡើយ");
  });

  it("renders uploaded state with real File ID and link on success", () => {
    const html = renderToString(
      React.createElement(ModuleDriveSync, {
        moduleName: "Module 04: Khmer Math Solver",
        saveToDrive: true,
        onToggleSave: () => {},
        status: "uploaded",
        uploadedRecord: {
          id: "drive-file-id-test-12345",
          name: "module04_math_solver_input.png",
          mimeType: "image/png",
          size: 4096,
          webViewLink: "https://drive.google.com/file/d/drive-file-id-test-12345/view",
          isPublic: false,
        },
        errorMessage: null,
      })
    );

    expect(html).toContain("បានរក្សាទុកក្នុង Google Drive ដោយជោគជ័យ");
    expect(html).toContain("drive-file-id-test-12345");
    expect(html).toContain("module04_math_solver_input.png");
    expect(html).toContain("https://drive.google.com/file/d/drive-file-id-test-12345/view");
    expect(html).toContain("target=\"_blank\"");
  });

  it("renders truthful failure warning without breaking", () => {
    const html = renderToString(
      React.createElement(ModuleDriveSync, {
        moduleName: "Module 05: Lesson Studio",
        saveToDrive: true,
        onToggleSave: () => {},
        status: "failed",
        uploadedRecord: null,
        errorMessage: "Network timeout while reaching Google Drive",
      })
    );

    expect(html).toContain("មិនអាចរក្សាទុកក្នុង Google Drive បានទេ");
    expect(html).toContain("Network timeout while reaching Google Drive");
    expect(html).toContain("មុខងារដំណើរការរូបភាព AI នៅតែដំណើរការជោគជ័យធម្មតា");
  });
});

describe("uploadImageToDrive client helper", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends FormData when file is provided", async () => {
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
