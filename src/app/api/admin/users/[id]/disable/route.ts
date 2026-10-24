import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth-session";
import { validateCsrfToken } from "@/lib/auth-csrf";
import { UserStore, toSafeUser } from "@/lib/user-store";
import { AuditLogger } from "@/lib/audit-logger";
import { getClientIp } from "@/lib/auth-gate";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const adminCheck = await requireSuperAdmin(req);
  if ("response" in adminCheck) {
    return adminCheck.response;
  }

  const rawIp = getClientIp(req);

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const csrf = validateCsrfToken(req, body?.csrfToken);
  if (!csrf.valid) {
    return NextResponse.json({ error: csrf.error }, { status: 403 });
  }

  const target = await UserStore.getUserById(id);
  if (!target) {
    return NextResponse.json({ error: "រកមិនឃើញគណនីនេះទេ (User not found)" }, { status: 404 });
  }

  // Prevent self-disabling
  if (target.id === adminCheck.user.id) {
    return NextResponse.json(
      { error: "មិនអាចបិទដំណើរការគណនីផ្ទាល់ខ្លួនបានទេ (Cannot disable your own administrator account)" },
      { status: 400 }
    );
  }

  // Guard final active super admin or admin
  if (target.role === "SUPER_ADMIN" && target.status === "ACTIVE") {
    const activeSuperAdmins = await UserStore.countActiveSuperAdmins();
    if (activeSuperAdmins <= 1) {
      return NextResponse.json(
        { error: "មិនអាចបិទដំណើរការគណនី Super Admin ចុងក្រោយបានទេ (Cannot disable the final active super administrator)" },
        { status: 400 }
      );
    }
  } else if (target.role === "ADMIN" && target.status === "ACTIVE") {
    const activeAdmins = await UserStore.countActiveAdmins();
    if (activeAdmins <= 1) {
      return NextResponse.json(
        { error: "មិនអាចបិទដំណើរការគណនី Admin ចុងក្រោយបានទេ (Cannot disable the final active administrator)" },
        { status: 400 }
      );
    }
  }

  const updated = await UserStore.updateUser(id, { status: "DISABLED" });

  await AuditLogger.logEvent({
    type: "ACCOUNT_DISABLED",
    actorId: adminCheck.user.id,
    actorUsername: adminCheck.user.username,
    targetId: target.id,
    targetUsername: target.username,
    rawIp,
  });

  return NextResponse.json({
    success: true,
    user: toSafeUser(updated),
    message: "បានបិទដំណើរការគណនីដោយជោគជ័យ (Account disabled successfully)",
  });
}
