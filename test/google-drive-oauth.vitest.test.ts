import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  encryptGoogleDriveTokens,
  decryptGoogleDriveTokens,
  GoogleDriveOAuthTokens,
} from "../src/lib/google-drive-vault";
import { UserStore, toSafeUser, UserRecord, SafeUser } from "../src/lib/user-store";
import { DriveHistoryStore } from "../src/lib/drive-history-store";
import { GET as connectGET } from "../src/app/api/auth/google-drive/connect/route";
import { GET as callbackGET } from "../src/app/api/auth/google-drive/callback/route";
import { POST as disconnectPOST } from "../src/app/api/auth/google-drive/disconnect/route";
import { GET as statusGET } from "../src/app/api/auth/google-drive/status/route";
import { GET as historyGET } from "../src/app/api/drive-history/route";
import * as authSession from "../src/lib/auth-session";
import * as googleDriveOAuth from "../src/lib/google-drive-oauth";

describe("Google Drive OAuth 2.0 Integration Suite", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = "test_super_secret_vault_encryption_key_32_bytes!!";
    process.env.GOOGLE_OAUTH_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "test-client-secret-123";
    process.env.GOOGLE_DRIVE_FOLDER_ID = "1dS_Ul_WnVCCbJAKsn6CAT0vy9AB8Yx8f";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe("Google Drive Token Vault (AES-256-GCM)", () => {
    const mockTokens: GoogleDriveOAuthTokens = {
      access_token: "ya29.a0AfH6SMTestAccessToken12345",
      refresh_token: "1//04testRefreshToken67890",
      scope: "https://www.googleapis.com/auth/drive.file",
      token_type: "Bearer",
      expiry_date: Date.now() + 3600 * 1000,
      email: "owner@gmail.com",
    };

    it("encrypts and decrypts OAuth tokens accurately", () => {
      const encrypted = encryptGoogleDriveTokens(mockTokens);
      expect(typeof encrypted).toBe("string");
      expect(encrypted).not.toContain("ya29.a0AfH6SMTestAccessToken12345");
      expect(encrypted).not.toContain("1//04testRefreshToken67890");

      const decrypted = decryptGoogleDriveTokens(encrypted);
      expect(decrypted).not.toBeNull();
      expect(decrypted?.access_token).toBe(mockTokens.access_token);
      expect(decrypted?.refresh_token).toBe(mockTokens.refresh_token);
      expect(decrypted?.email).toBe("owner@gmail.com");
    });

    it("returns null or throws gracefully on tampered ciphertext", () => {
      const encrypted = encryptGoogleDriveTokens(mockTokens);
      const tampered = encrypted.slice(0, -6) + "abcdef";
      expect(decryptGoogleDriveTokens(tampered)).toBeNull();
    });
  });

  describe("UserStore Security & SafeUser Sanitization", () => {
    const mockRawUser: UserRecord = {
      id: "user-test-owner-99",
      username: "owner",
      email: "owner@gmail.com",
      role: "ADMIN",
      status: "ACTIVE",
      createdAt: Date.now(),
      googleDriveConnected: true,
      googleDriveTokenEncrypted: "v1:enc:super_secret_cipher_payload",
      googleDriveEmail: "owner@gmail.com",
      googleDriveConnectedAt: Date.now(),
      googleDriveScope: "https://www.googleapis.com/auth/drive.file",
    } as UserRecord;

    it("toSafeUser() completely strips googleDriveTokenEncrypted", () => {
      const safe = toSafeUser(mockRawUser);
      expect(safe.googleDriveConnected).toBe(true);
      expect(safe.googleDriveEmail).toBe("owner@gmail.com");
      expect((safe as any).googleDriveTokenEncrypted).toBeUndefined();
    });
  });

  describe("DriveHistoryStore RBAC Isolation", () => {
    it("isolates records between different users and allows ADMIN full visibility", async () => {
      const user1Record = await DriveHistoryStore.addRecord({
        userId: "user-alpha-1",
        module: "Module 01: Math OCR",
        filename: "test_formula.png",
        mimeType: "image/png",
        size: 2048,
        status: "uploaded",
        folderId: "1dS_Ul_WnVCCbJAKsn6CAT0vy9AB8Yx8f",
        resultDriveFileId: "drive-id-alpha",
      });

      const user2Record = await DriveHistoryStore.addRecord({
        userId: "user-beta-2",
        module: "Module 02: Background Remover",
        filename: "cutout.png",
        mimeType: "image/png",
        size: 4096,
        status: "uploaded",
        folderId: "1dS_Ul_WnVCCbJAKsn6CAT0vy9AB8Yx8f",
        resultDriveFileId: "drive-id-beta",
      });

      // User 1 only sees user 1 records
      const user1List = await DriveHistoryStore.listRecordsForUser("user-alpha-1");
      expect(user1List.some((r) => r.id === user1Record.id)).toBe(true);
      expect(user1List.some((r) => r.id === user2Record.id)).toBe(false);

      // User 2 only sees user 2 records
      const user2List = await DriveHistoryStore.listRecordsForUser("user-beta-2");
      expect(user2List.some((r) => r.id === user2Record.id)).toBe(true);
      expect(user2List.some((r) => r.id === user1Record.id)).toBe(false);

      // Admin sees all records
      const allRecords = await DriveHistoryStore.listAllRecords();
      expect(allRecords.some((r) => r.id === user1Record.id)).toBe(true);
      expect(allRecords.some((r) => r.id === user2Record.id)).toBe(true);
    });
  });

  describe("OAuth Route Protection & Endpoints", () => {
    const mockAuthUser: SafeUser = {
      id: "user-test-owner-99",
      username: "owner",
      email: "owner@gmail.com",
      displayName: "Owner",
      role: "ADMIN",
      status: "ACTIVE",
      mustChangePassword: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      googleDriveConnected: false,
    };

    it("GET /api/auth/google-drive/connect requires active session", async () => {
      vi.spyOn(authSession, "getSessionUser").mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/auth/google-drive/connect", {
        headers: { accept: "application/json" },
      });
      const res = await connectGET(req);
      expect(res.status).toBe(401);
    });

    it("GET /api/auth/google-drive/connect generates auth URL and CSRF cookie", async () => {
      vi.spyOn(authSession, "getSessionUser").mockResolvedValue(mockAuthUser);
      vi.spyOn(googleDriveOAuth, "generateDriveAuthUrl").mockReturnValue(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=test"
      );

      const req = new NextRequest("http://localhost:3000/api/auth/google-drive/connect", {
        headers: { accept: "application/json" },
      });
      const res = await connectGET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.authUrl).toContain("accounts.google.com");

      const stateCookie = res.cookies.get("dyt_gdrive_oauth_state");
      expect(stateCookie).toBeDefined();
    });

    it("GET /api/auth/google-drive/callback blocks CSRF state mismatches", async () => {
      vi.spyOn(authSession, "getSessionUser").mockResolvedValue(mockAuthUser);

      // Callback with mismatched state
      const badState = Buffer.from(
        JSON.stringify({ userId: mockAuthUser.id, nonce: "invalid-nonce", timestamp: Date.now() })
      ).toString("base64url");

      const req = new NextRequest(
        `http://localhost:3000/api/auth/google-drive/callback?code=mock_code&state=${badState}`,
        {
          headers: {
            cookie: "dyt_gdrive_oauth_state=real-nonce",
          },
        }
      );

      const res = await callbackGET(req);
      expect(res.status).toBe(307); // Next redirect
      const location = res.headers.get("location");
      expect(location).toContain("drive_error");
      expect(location).toMatch(/State(\+|%20)CSRF(\+|%20)mismatch/);
    });

    it("GET /api/auth/google-drive/status reports safe status without credentials", async () => {
      vi.spyOn(authSession, "getSessionUser").mockResolvedValue({
        ...mockAuthUser,
        googleDriveConnected: true,
        googleDriveEmail: "owner@gmail.com",
      });

      vi.spyOn(googleDriveOAuth, "getUserDriveClient").mockResolvedValue({} as any);
      vi.spyOn(googleDriveOAuth, "verifyTargetFolderAccess").mockResolvedValue({
        accessible: true,
        folderName: "DYT_Math_Images",
      });

      const req = new NextRequest("http://localhost:3000/api/auth/google-drive/status");
      const res = await statusGET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.connected).toBe(true);
      expect(data.email).toBe("owner@gmail.com");
      expect(data.folderAccessible).toBe(true);
      expect(data.folderId).toBe("1dS_Ul_WnVCCbJAKsn6CAT0vy9AB8Yx8f");
      expect(data.access_token).toBeUndefined();
      expect(data.refresh_token).toBeUndefined();
    });

    it("POST /api/auth/google-drive/disconnect revokes tokens without touching user drive files", async () => {
      vi.spyOn(authSession, "getSessionUser").mockResolvedValue({
        ...mockAuthUser,
        googleDriveConnected: true,
      });
      const disconnectSpy = vi.spyOn(googleDriveOAuth, "disconnectUserDrive").mockResolvedValue(true);

      const req = new NextRequest("http://localhost:3000/api/auth/google-drive/disconnect", {
        method: "POST",
      });
      const res = await disconnectPOST(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(disconnectSpy).toHaveBeenCalledWith(mockAuthUser.id);
    });

    it("GET /api/drive-history enforces user isolation for regular users", async () => {
      const normalUser: SafeUser = {
        id: "normal-student-12",
        username: "student",
        email: "student@example.com",
        displayName: "Student",
        role: "USER",
        status: "ACTIVE",
        mustChangePassword: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      vi.spyOn(authSession, "getSessionUser").mockResolvedValue(normalUser);
      const listSpy = vi.spyOn(DriveHistoryStore, "listRecordsForUser").mockResolvedValue([
        {
          id: "rec-1",
          userId: "normal-student-12",
          module: "Module 01: Math OCR",
          filename: "test.png",
          mimeType: "image/png",
          size: 1024,
          status: "uploaded",
          createdAt: Date.now(),
          folderId: "1dS_Ul_WnVCCbJAKsn6CAT0vy9AB8Yx8f",
        },
      ]);

      const req = new NextRequest("http://localhost:3000/api/drive-history");
      const res = await historyGET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(listSpy).toHaveBeenCalledWith("normal-student-12");
      expect(data.records.length).toBe(1);
    });
  });
});
