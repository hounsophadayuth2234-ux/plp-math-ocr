import { describe, it, expect, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import {
  encryptManagedPassword,
  decryptManagedPassword,
} from "@/lib/managed-credential-vault";
import { UserStore, UserRecord, toSafeUser, toAdminSafeUser } from "@/lib/user-store";
import { createSessionToken } from "@/lib/auth-session";
import { generateCsrfToken } from "@/lib/auth-csrf";
import { GET as adminUsersGet, POST as adminUsersPost } from "@/app/api/admin/users/route";
import { POST as adminUserResetPassword } from "@/app/api/admin/users/[id]/reset-password/route";
import { POST as changePasswordRoute } from "@/app/api/auth/change-password/route";

describe("Admin-Managed Team Credential Visibility (AES-256-GCM Reversible Vault)", () => {
  const TEST_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  let adminUser: UserRecord;
  let teacherUser: UserRecord;
  let adminToken: string;
  let teacherToken: string;
  let csrfToken: string;

  beforeEach(async () => {
    vi.stubEnv("APP_GATE_SESSION_SECRET", TEST_SECRET);
    UserStore.__resetTestStore();

    csrfToken = generateCsrfToken();

    // Create 1 Admin
    adminUser = await UserStore.createUser({
      username: "admin_lead",
      email: "lead@school.internal",
      displayName: "Lead Administrator",
      passwordHash: bcrypt.hashSync("AdminPass2026!Key", 10),
      role: "ADMIN",
      status: "ACTIVE",
      managedPasswordEncrypted: encryptManagedPassword("AdminPass2026!Key"),
    });

    // Create 1 Teacher (User)
    teacherUser = await UserStore.createUser({
      username: "teacher_sokha",
      email: "sokha@school.internal",
      displayName: "Teacher Sokha",
      passwordHash: bcrypt.hashSync("InitialTeacher2026!", 10),
      role: "USER",
      status: "ACTIVE",
      managedPasswordEncrypted: encryptManagedPassword("InitialTeacher2026!"),
    });

    adminToken = await createSessionToken(adminUser);
    teacherToken = await createSessionToken(teacherUser);
  });

  describe("AES-256-GCM Reversible Encryption Engine", () => {
    it("successfully encrypts and decrypts passwords with diverse character sets", () => {
      const samplePasswords = [
        "Educator2026!",
        "Complex!@#$%^&*()_+{}[]:;'<>?,./",
        "ពាក្យសម្ងាត់គ្រូបង្រៀន២០២៦", // Khmer unicode
        "Short12!",
        "A".repeat(128),
      ];

      for (const pass of samplePasswords) {
        const encrypted = encryptManagedPassword(pass);
        expect(encrypted).toBeDefined();
        expect(encrypted).not.toEqual(pass);
        expect(encrypted.split(":")).toHaveLength(3); // iv:tag:ciphertext

        const decrypted = decryptManagedPassword(encrypted);
        expect(decrypted).toEqual(pass);
      }
    });

    it("generates different ciphertexts for the same plaintext due to random IV", () => {
      const plain = "ConsistentSecret2026!";
      const c1 = encryptManagedPassword(plain);
      const c2 = encryptManagedPassword(plain);

      expect(c1).not.toEqual(c2);
      expect(decryptManagedPassword(c1)).toEqual(plain);
      expect(decryptManagedPassword(c2)).toEqual(plain);
    });

    it("returns null safely on invalid or tampered ciphertext", () => {
      expect(decryptManagedPassword("invalid-cipher-format")).toBeNull();
      expect(decryptManagedPassword("a:b:c")).toBeNull();

      const valid = encryptManagedPassword("SecretPassword123!");
      const parts = valid.split(":");
      const tampered = `${parts[0]}:${parts[1]}:dGFtcGVyZWQ=`;
      expect(decryptManagedPassword(tampered)).toBeNull();
    });
  });

  describe("Data Model Isolation & Exposure Boundary", () => {
    it("standard toSafeUser omits both managedPasswordEncrypted and visiblePassword", () => {
      const safe = toSafeUser(teacherUser);
      expect((safe as any).managedPasswordEncrypted).toBeUndefined();
      expect((safe as any).passwordHash).toBeUndefined();
      expect(safe.visiblePassword).toBeUndefined();
    });

    it("toAdminSafeUser safely decrypts visiblePassword for Admin context", () => {
      const adminSafe = toAdminSafeUser(teacherUser);
      expect((adminSafe as any).managedPasswordEncrypted).toBeUndefined();
      expect((adminSafe as any).passwordHash).toBeUndefined();
      expect(adminSafe.visiblePassword).toEqual("InitialTeacher2026!");
    });

    it("toAdminSafeUser returns visiblePassword: null for legacy accounts without encrypted vault entry", async () => {
      const legacyUser = await UserStore.createUser({
        username: "legacy_user",
        email: "legacy@school.internal",
        displayName: "Legacy User",
        passwordHash: bcrypt.hashSync("LegacyPass2026!", 10),
        role: "USER",
        status: "ACTIVE",
      });

      const adminSafe = toAdminSafeUser(legacyUser);
      expect(adminSafe.visiblePassword).toBeNull();
    });
  });

  describe("Admin API Endpoints Integration", () => {
    it("GET /api/admin/users returns visiblePassword for Admin", async () => {
      const req = new NextRequest("http://localhost/api/admin/users", {
        headers: {
          cookie: `dyt_gate_session=${adminToken}; dyt_csrf_token=${csrfToken}`,
        },
      });

      const res = await adminUsersGet(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(Array.isArray(data.users)).toBe(true);
      const sokha = data.users.find((u: any) => u.username === "teacher_sokha");
      expect(sokha).toBeDefined();
      expect(sokha.visiblePassword).toEqual("InitialTeacher2026!");
      expect(sokha.passwordHash).toBeUndefined();
    });

    it("POST /api/admin/users creates account with visiblePassword stored in vault", async () => {
      const req = new NextRequest("http://localhost/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
          cookie: `dyt_gate_session=${adminToken}; dyt_csrf_token=${csrfToken}`,
        },
        body: JSON.stringify({
          username: "new_teacher",
          email: "newteacher@school.internal",
          displayName: "New Teacher",
          password: "CustomPass2026!Assigned",
          role: "USER",
        }),
      });

      const res = await adminUsersPost(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.user.username).toBe("new_teacher");
      expect(data.user.visiblePassword).toBe("CustomPass2026!Assigned");

      // Verify DB record has managedPasswordEncrypted and login hash
      const dbRecord = await UserStore.getUserByUsernameOrEmail("new_teacher");
      expect(dbRecord?.managedPasswordEncrypted).toBeDefined();
      expect(bcrypt.compareSync("CustomPass2026!Assigned", dbRecord!.passwordHash)).toBe(true);
    });

    it("POST /api/admin/users/[id]/reset-password updates visiblePassword in vault", async () => {
      const req = new NextRequest(`http://localhost/api/admin/users/${teacherUser.id}/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
          cookie: `dyt_gate_session=${adminToken}; dyt_csrf_token=${csrfToken}`,
        },
        body: JSON.stringify({
          password: "NewlyAssignedPass2026!",
        }),
      });

      const res = await adminUserResetPassword(req, { params: Promise.resolve({ id: teacherUser.id }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.visiblePassword).toBe("NewlyAssignedPass2026!");

      // Verify updated in DB
      const dbRecord = await UserStore.getUserById(teacherUser.id);
      expect(decryptManagedPassword(dbRecord!.managedPasswordEncrypted!)).toBe("NewlyAssignedPass2026!");
    });

    it("POST /api/auth/change-password updates vault so Admin can view new password", async () => {
      const req = new NextRequest("http://localhost/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
          cookie: `dyt_gate_session=${teacherToken}; dyt_csrf_token=${csrfToken}`,
        },
        body: JSON.stringify({
          currentPassword: "InitialTeacher2026!",
          newPassword: "TeacherUpdated2026!Sec",
        }),
      });

      const res = await changePasswordRoute(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify DB record vault is updated
      const dbRecord = await UserStore.getUserById(teacherUser.id);
      expect(decryptManagedPassword(dbRecord!.managedPasswordEncrypted!)).toBe("TeacherUpdated2026!Sec");
    });
  });
});
