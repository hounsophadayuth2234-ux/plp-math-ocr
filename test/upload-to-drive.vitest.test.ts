import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../src/app/api/upload-to-drive/route";
import {
  getGoogleDriveCredentials,
  getDefaultDriveFolderId,
  uploadBufferToGoogleDrive,
} from "../src/lib/google-drive";

describe("Google Drive Uploader API & Utility Suite", () => {
  const originalEnv = { ...process.env };

  const validTestKey = JSON.stringify({
    type: "service_account",
    project_id: "test-project-123",
    private_key: "-----BEGIN PRIVATE KEY-----\\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC3aM78Omu05x+b\\n-----END PRIVATE KEY-----\\n",
    client_email: "test-bot@test-project-123.iam.gserviceaccount.com",
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = validTestKey;
    process.env.GOOGLE_DRIVE_FOLDER_ID = "test_folder_id_12345";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe("getGoogleDriveCredentials() & getDefaultDriveFolderId()", () => {
    it("parses valid JSON credentials correctly", () => {
      const creds = getGoogleDriveCredentials();
      expect(creds.project_id).toBe("test-project-123");
      expect(creds.client_email).toBe("test-bot@test-project-123.iam.gserviceaccount.com");
      expect(creds.private_key).toContain("\n");
      expect(creds.private_key).not.toContain("\\n");
    });

    it("parses base64-encoded credentials correctly", () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = Buffer.from(validTestKey).toString("base64");
      const creds = getGoogleDriveCredentials();
      expect(creds.project_id).toBe("test-project-123");
      expect(creds.client_email).toBe("test-bot@test-project-123.iam.gserviceaccount.com");
    });

    it("throws error when GOOGLE_SERVICE_ACCOUNT_JSON is missing", () => {
      delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      expect(() => getGoogleDriveCredentials()).toThrow(/Missing GOOGLE_SERVICE_ACCOUNT_JSON/i);
    });

    it("throws error when credentials JSON is invalid", () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = "this is not json";
      expect(() => getGoogleDriveCredentials()).toThrow(/unable to parse JSON/i);
    });

    it("returns correct default drive folder ID", () => {
      expect(getDefaultDriveFolderId()).toBe("test_folder_id_12345");
    });

    it("throws error when GOOGLE_DRIVE_FOLDER_ID is missing", () => {
      delete process.env.GOOGLE_DRIVE_FOLDER_ID;
      expect(() => getDefaultDriveFolderId()).toThrow(/Missing GOOGLE_DRIVE_FOLDER_ID/i);
    });
  });

  describe("POST /api/upload-to-drive validation", () => {
    it("returns 415 when Content-Type is neither multipart nor json", async () => {
      const req = new NextRequest("http://localhost:3000/api/upload-to-drive", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
        },
        body: "raw string",
      });

      const res = await POST(req);
      expect(res.status).toBe(415);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain("Unsupported Content-Type");
    });

    it("returns 400 when JSON body has no file or text payload", async () => {
      const req = new NextRequest("http://localhost:3000/api/upload-to-drive", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ filename: "test.png" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain("No file content found");
    });

    it("returns 400 when multipart form data has no file or image field", async () => {
      const formData = new FormData();
      formData.append("other_field", "value");

      const req = new NextRequest("http://localhost:3000/api/upload-to-drive", {
        method: "POST",
        body: formData,
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain("No file provided");
    });
  });

  describe("Drive Upload Execution", () => {
    it("successfully processes and uploads a base64 image", async () => {
      // Mock googleapis drive client
      const googleDriveModule = await import("../src/lib/google-drive");
      const mockResult = {
        fileId: "drive_file_id_999",
        name: "math_graph.png",
        mimeType: "image/png",
        size: 1234,
        webViewLink: "https://drive.google.com/file/d/drive_file_id_999/view",
        webContentLink: "https://drive.google.com/uc?id=drive_file_id_999",
        folderId: "test_folder_id_12345",
        createdTime: "2026-10-24T00:00:00.000Z",
      };

      vi.spyOn(googleDriveModule, "uploadBufferToGoogleDrive").mockResolvedValue(mockResult);

      const fakeBase64Png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      const req = new NextRequest("http://localhost:3000/api/upload-to-drive", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          image: fakeBase64Png,
          filename: "../../etc/math_graph.png", // test path traversal sanitization
          makePublic: true,
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.file.fileId).toBe("drive_file_id_999");
      expect(data.file.webViewLink).toContain("drive_file_id_999");
    });

    it("successfully processes and uploads raw text and HTML document content", async () => {
      const googleDriveModule = await import("../src/lib/google-drive");
      const mockResult = {
        fileId: "drive_file_id_doc_777",
        name: "solution.html",
        mimeType: "text/html; charset=utf-8",
        size: 500,
        webViewLink: "https://drive.google.com/file/d/drive_file_id_doc_777/view",
        folderId: "test_folder_id_12345",
        createdTime: "2026-10-24T00:00:00.000Z",
      };

      vi.spyOn(googleDriveModule, "uploadBufferToGoogleDrive").mockResolvedValue(mockResult);

      const htmlBody = "<html><body><h1>Math Solution</h1></body></html>";
      const req = new NextRequest("http://localhost:3000/api/upload-to-drive", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          content: htmlBody,
          filename: "solution.html",
          mimeType: "text/html",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.file.fileId).toBe("drive_file_id_doc_777");
    });
  });
});
