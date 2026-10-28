import "server-only";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth-session";
import { SafeUser } from "@/lib/user-store";

/**
 * Distinguishes Next.js internal control-flow exceptions (NEXT_REDIRECT / NEXT_NOT_FOUND)
 * from unexpected runtime errors to preserve redirect/404 handling.
 */
function isNextControlFlowError(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "digest" in error) {
    const digest = String((error as { digest?: unknown }).digest || "");
    return (
      digest.startsWith("NEXT_REDIRECT") ||
      digest.startsWith("NEXT_NOT_FOUND") ||
      digest.includes("NEXT_REDIRECT") ||
      digest.includes("NEXT_NOT_FOUND")
    );
  }
  return false;
}

/**
 * Server-only guard enforcing authoritative SUPER_ADMIN authentication.
 *
 * Rules:
 * - Unauthenticated (no valid session): redirects to /login.
 * - Authenticated but role !== SUPER_ADMIN (USER, ADMIN, etc.): returns notFound() (404)
 *   to completely conceal the existence of the administrative surface.
 * - Any error, missing role, or malformed session: fails closed.
 */
export async function requireSuperAdmin(): Promise<SafeUser> {
  let user: SafeUser | null = null;

  try {
    const cookieStore = await cookies();
    user = await getSessionUser({ cookies: cookieStore } as any);
  } catch (error: unknown) {
    if (isNextControlFlowError(error)) {
      throw error;
    }
    // Fail closed on unhandled session resolution exceptions
    notFound();
  }

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "SUPER_ADMIN" || user.status !== "ACTIVE") {
    notFound();
  }

  return user;
}
