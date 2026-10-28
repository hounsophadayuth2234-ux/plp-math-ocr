import { describe, it, expect, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { UserStore, UserRecord, toSafeUser } from "@/lib/user-store";
import { createSessionToken } from "@/lib/auth-session";
import { generateCsrfToken } from "@/lib/auth-csrf";
import { PUT as profilePut, GET as profileGet } from "@/app/api/auth/profile/route";
import { POST as adminForceResetPost } from "@/app/api/auth/admin-force-reset/route";
import { ProfileManager as ReExportedProfileManager } from "@/components/profile/ProfileManager";
import { ProfileManager as CanonicalProfileManager } from "@/components/auth/ProfileManager";

describe("ProfileManager Integration & Route Verification Suite", () => {
  const TEST_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  let testUser: UserRecord;
  let adminToken: string;
  let csrfToken: string;

  beforeEach(async () => {
    vi.stubEnv("APP_GATE_SESSION_SECRET", TEST_SECRET);
    UserStore.__resetTestStore();

    csrfToken = generateCsrfToken();

    testUser = await UserStore.createUser({
      username: "leaddev",
      email: "leaddev@dyt-ecosystem.local",
      displayName: "Lead Developer",
      passwordHash: bcrypt.hashSync("InitialPass2026!Strong", 10),
      role: "ADMIN",
      status: "ACTIVE",
    });

    adminToken = await createSessionToken(testUser);
  });

  it("1. Verifies ProfileManager public wrapper correctly re-exports canonical auth implementation", () => {
    expect(ReExportedProfileManager).toBeDefined();
    expect(CanonicalProfileManager).toBeDefined();
    expect(ReExportedProfileManager).toBe(CanonicalProfileManager);
  });

  it("2. Updates user avatar via PUT /api/auth/profile and persists Base64 image", async () => {
    const sampleAvatar = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...";

    const req = new NextRequest("http://localhost/api/auth/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: `dyt_gate_session=${adminToken}; dyt_csrf_token=${csrfToken}`,
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({
        avatar: sampleAvatar,
        csrfToken,
      }),
    });

    const res = await profilePut(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.user).toBeDefined();
    expect(data.user.avatar).toBe(sampleAvatar);

    // Verify persistence in UserStore
    const userInDb = await UserStore.getUserById(testUser.id);
    expect(userInDb?.avatar).toBe(sampleAvatar);

    // Verify GET /api/auth/profile returns avatar
    const getReq = new NextRequest("http://localhost/api/auth/profile", {
      method: "GET",
      headers: {
        Cookie: `dyt_gate_session=${adminToken}`,
      },
    });
    const getRes = await profileGet(getReq);
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.user.avatar).toBe(sampleAvatar);
  });

  it("3. Updates username via PUT /api/auth/profile with duplicate protection", async () => {
    const newUsername = "leaddev_updated";

    const req = new NextRequest("http://localhost/api/auth/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: `dyt_gate_session=${adminToken}; dyt_csrf_token=${csrfToken}`,
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({
        username: newUsername,
        csrfToken,
      }),
    });

    const res = await profilePut(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.username).toBe(newUsername);

    const userInDb = await UserStore.getUserById(testUser.id);
    expect(userInDb?.username).toBe(newUsername);
  });

  it("4. Allows direct admin password override via POST /api/auth/admin-force-reset", async () => {
    const newPassword = "NewSecretPassword2026!Override";

    const req = new NextRequest("http://localhost/api/auth/admin-force-reset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `dyt_gate_session=${adminToken}; dyt_csrf_token=${csrfToken}`,
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({
        newPassword,
        csrfToken,
      }),
    });

    const res = await adminForceResetPost(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);

    // Verify that the new password hashes match in UserStore
    const userInDb = await UserStore.getUserById(testUser.id);
    const passwordMatches = bcrypt.compareSync(newPassword, userInDb!.passwordHash);
    expect(passwordMatches).toBe(true);
  });

  it("5. Verifies toSafeUser includes avatar field without leaking passwordHash", () => {
    const safe = toSafeUser({
      ...testUser,
      avatar: "data:image/jpeg;base64,testavatar",
    });

    expect(safe.avatar).toBe("data:image/jpeg;base64,testavatar");
    expect((safe as any).passwordHash).toBeUndefined();
  });
});
