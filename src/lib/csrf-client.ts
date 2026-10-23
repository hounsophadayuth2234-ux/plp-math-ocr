"use client";

import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "./csrf-constants";

export { CSRF_COOKIE_NAME, CSRF_HEADER_NAME };

/**
 * Reads the CSRF token directly from document.cookie on the client.
 */
export function getClientCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${CSRF_COOKIE_NAME}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1].trim()) : null;
}

/**
 * Requests a fresh CSRF token from /api/auth/csrf with anti-cache headers.
 * Safe client-side refresh/retry mechanism that guarantees the cookie is synchronized.
 */
export async function fetchFreshCsrfToken(): Promise<string | null> {
  try {
    const res = await fetch(`/api/auth/csrf?_t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      credentials: "include",
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    if (data?.csrfToken && typeof data.csrfToken === "string") {
      return data.csrfToken;
    }
  } catch {}
  return getClientCsrfToken();
}

/**
 * Resolves an active CSRF token by prioritizing:
 * 1. An explicit in-memory token (e.g. from the login response)
 * 2. The client-readable dyt_csrf_token cookie
 * 3. A fresh token fetched from /api/auth/csrf
 */
export async function getOrRefreshCsrfToken(
  preferredToken?: string | null
): Promise<string | null> {
  if (preferredToken && preferredToken.trim().length >= 16) {
    return preferredToken.trim();
  }
  const fromCookie = getClientCsrfToken();
  if (fromCookie && fromCookie.trim().length >= 16) {
    return fromCookie.trim();
  }
  return await fetchFreshCsrfToken();
}
