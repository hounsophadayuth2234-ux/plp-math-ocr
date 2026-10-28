import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-session";
import { validateCsrfToken } from "@/lib/auth-csrf";
import { UserStore, toSafeUser } from "@/lib/user-store";
import {
  validateUsername,
  validateEmail,
  validateDisplayName,
} from "@/lib/auth-validators";
import { AuditLogger } from "@/lib/audit-logger";
import { ActivityTracker } from "@/lib/activity-tracker";
import { getClientIp } from "@/lib/auth-gate";

import { enforceRateLimit } from "@/lib/rate-limiter";

/**
 * GET /api/auth/profile
 * Returns the currently authenticated user's profile.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("response" in auth) {
    return auth.response;
  }

  const user = await UserStore.getUserById(auth.user.id);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    user: toSafeUser(user),
  });
}

/**
 * PUT /api/auth/profile
 * Updates the user's personal profile (Display Name, Username, Email, Avatar).
 */
export async function PUT(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("response" in auth) {
    return auth.response;
  }

  // Rate limiting (15 req/min per user)
  const rateLimitBlock = await enforceRateLimit(req, "profile_update", { userId: auth.user.id });
  if (rateLimitBlock) {
    return rateLimitBlock;
  }

  const rawIp = getClientIp(req);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  // Validate CSRF
  const csrf = validateCsrfToken(req, body?.csrfToken);
  if (!csrf.valid) {
    return NextResponse.json({ error: csrf.error }, { status: 403 });
  }

  const currentUser = await UserStore.getUserById(auth.user.id);
  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const updates: any = {};

  if (body?.displayName !== undefined) {
    const val = validateDisplayName(body.displayName);
    if (!val.valid) return NextResponse.json({ error: val.error }, { status: 400 });
    updates.displayName = val.value;
  }

  if (body?.username !== undefined && body.username.toLowerCase() !== currentUser.username) {
    const val = validateUsername(body.username);
    if (!val.valid) return NextResponse.json({ error: val.error }, { status: 400 });
    const duplicate = await UserStore.getUserByUsernameOrEmail(val.value!);
    if (duplicate && duplicate.id !== currentUser.id) {
      return NextResponse.json(
        { error: "ឈ្មោះអ្នកប្រើប្រាស់នេះមានរួចហើយ (Username is already taken)" },
        { status: 400 }
      );
    }
    updates.username = val.value;
  }

  if (body?.email !== undefined && body.email.toLowerCase() !== currentUser.email) {
    const val = validateEmail(body.email);
    if (!val.valid) return NextResponse.json({ error: val.error }, { status: 400 });
    const duplicate = await UserStore.getUserByUsernameOrEmail(val.value!);
    if (duplicate && duplicate.id !== currentUser.id) {
      return NextResponse.json(
        { error: "អ៊ីមែលនេះមានរួចហើយ (Email is already registered)" },
        { status: 400 }
      );
    }
    updates.email = val.value;
  }

  if (body?.avatar !== undefined) {
    if (body.avatar === null || body.avatar === "") {
      updates.avatar = undefined;
    } else if (typeof body.avatar === "string") {
      const trimmed = body.avatar.trim();
      // Enforce 5MB limit on data URI
      if (trimmed.length > 7 * 1024 * 1024) {
        return NextResponse.json(
          { error: "ទំហំរូបភាព Profile ធំពេក (Profile image exceeds 5MB size limit)" },
          { status: 400 }
        );
      }
      const isBase64Image = /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(trimmed) &&
        !trimmed.toLowerCase().includes("<svg") &&
        !trimmed.toLowerCase().includes("<script") &&
        !trimmed.toLowerCase().includes("javascript:");
      const isInternalPath = trimmed.startsWith("/brand/") || trimmed.startsWith("https://images.unsplash.com");
      if (!isBase64Image && !isInternalPath) {
        return NextResponse.json(
          { error: "ទម្រង់រូបភាពមិនត្រឹមត្រូវ។ អនុញ្ញាតតែ PNG, JPG, JPEG ឬ WEBP (Invalid image format)" },
          { status: 400 }
        );
      }
      updates.avatar = trimmed;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({
      success: true,
      user: toSafeUser(currentUser),
      message: "គ្មានការផ្លាស់ប្តូរ (No changes made)",
    });
  }

  const updatedUser = await UserStore.updateUser(currentUser.id, updates);

  await AuditLogger.logEvent({
    type: "USER_UPDATED",
    actorId: currentUser.id,
    actorUsername: currentUser.username,
    targetId: currentUser.id,
    targetUsername: updatedUser.username,
    rawIp,
    details: updates,
  });

  await ActivityTracker.recordActivity({
    userId: currentUser.id,
    username: updatedUser.username,
    displayName: updatedUser.displayName,
    role: updatedUser.role,
    module: "profile",
    action: "profile_updated",
    title: `Updated personal profile (${Object.keys(updates).join(", ")})`,
    details: updates,
  });

  return NextResponse.json({
    success: true,
    user: toSafeUser(updatedUser),
    message: "បានធ្វើបច្ចុប្បន្នភាពព័ត៌មានផ្ទាល់ខ្លួនដោយជោគជ័យ (Profile updated successfully)",
  });
}
