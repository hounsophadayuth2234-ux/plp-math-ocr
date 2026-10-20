import dns from "node:dns/promises";
import net from "node:net";

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxSizeBytes?: number;
  maxRedirects?: number;
  allowedProtocols?: ("http:" | "https:")[];
  requireHttps?: boolean;
  allowedContentTypes?: string[];
  headers?: Record<string, string>;
}

export interface SafeFetchResult {
  response: Response;
  finalUrl: string;
  buffer: ArrayBuffer;
  contentType: string;
}

/**
 * List of dangerous/internal hostnames and domain patterns.
 */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "0.0.0.0",
  "127.0.0.1",
  "::1",
  "metadata",
  "metadata.google.internal",
  "instance-data",
  "kubernetes.default",
  "kubernetes.default.svc",
]);

const BLOCKED_DOMAIN_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home",
  ".corp",
  ".invalid",
  ".onion",
  ".metadata.google.internal",
];

/**
 * Checks whether a given hostname is a known internal/reserved name or suffix.
 */
export function isBlockedHostname(rawHostname: string): boolean {
  if (!rawHostname || typeof rawHostname !== "string") return true;
  const hostname = rawHostname.trim().toLowerCase().replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return true;
  }

  for (const suffix of BLOCKED_DOMAIN_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks whether an IPv4 address belongs to private, loopback, link-local,
 * multicast, or reserved ranges (RFC 1918, RFC 3927, RFC 5735, RFC 5737, etc.).
 */
export function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // malformed treated as blocked
  }

  const [a, b, c, d] = parts;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;

  // 10.0.0.0/8 (Private network RFC 1918)
  if (a === 10) return true;

  // 100.64.0.0/10 (Shared Address Space / CGNAT RFC 6598: 100.64.0.0 - 100.127.255.255)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 169.254.0.0/16 (Link-local RFC 3927 - AWS/GCP/Azure metadata sits on 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 (Private network RFC 1918: 172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (a === 192 && b === 0 && c === 0) return true;

  // 192.0.2.0/24 (TEST-NET-1 RFC 5737)
  if (a === 192 && b === 0 && c === 2) return true;

  // 192.88.99.0/24 (6to4 Relay Anycast RFC 3068)
  if (a === 192 && b === 88 && c === 99) return true;

  // 192.168.0.0/16 (Private network RFC 1918)
  if (a === 192 && b === 168) return true;

  // 198.18.0.0/15 (Network Benchmark Tests RFC 2544: 198.18.0.0 - 198.19.255.255)
  if (a === 198 && (b === 18 || b === 19)) return true;

  // 198.51.100.0/24 (TEST-NET-2 RFC 5737)
  if (a === 198 && b === 51 && c === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3 RFC 5737)
  if (a === 203 && b === 0 && c === 113) return true;

  // 224.0.0.0/4 (Multicast RFC 5771: 224.0.0.0 - 239.255.255.255)
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 (Reserved RFC 1112: 240.0.0.0 - 255.255.255.254)
  if (a >= 240) return true;

  // 255.255.255.255/32 (Broadcast)
  if (a === 255 && b === 255 && c === 255 && d === 255) return true;

  return false;
}

/**
 * Checks whether an IPv6 address belongs to private, loopback, link-local,
 * documentation, or multicast ranges (RFC 4291, RFC 4193, etc.).
 */
export function isPrivateOrReservedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase().trim();

  // 1. Loopback (::1)
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;

  // 2. Unspecified (::)
  if (normalized === "::" || normalized === "0:0:0:0:0:0:0:0") return true;

  // 3. IPv4-mapped IPv6 (::ffff:127.0.0.1 or ::ffff:7f00:1)
  const v4MappedMatch = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4MappedMatch) {
    return isPrivateOrReservedIpv4(v4MappedMatch[1]);
  }

  // 4. Unique Local Addresses (fc00::/7 -> fc.. or fd..)
  if (/^f[cd][0-9a-f]{2}:/i.test(normalized) || normalized.startsWith("fc:") || normalized.startsWith("fd:")) {
    return true;
  }

  // 5. Link-Local Unicast (fe80::/10 -> fe8.., fe9.., fea.., feb..)
  if (/^fe[89ab][0-9a-f]:/i.test(normalized) || normalized.startsWith("fe80:")) {
    return true;
  }

  // 6. Multicast (ff00::/8)
  if (normalized.startsWith("ff")) {
    return true;
  }

  // 7. Documentation (2001:db8::/32)
  if (normalized.startsWith("2001:db8:") || normalized.startsWith("2001:0db8:")) {
    return true;
  }

  // 8. Discard prefix (100::/64)
  if (normalized.startsWith("100:")) {
    return true;
  }

  return false;
}

/**
 * Universal IP validator: returns true if IP is private, loopback, or reserved.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    return isPrivateOrReservedIpv4(ip);
  }
  if (version === 6) {
    return isPrivateOrReservedIpv6(ip);
  }
  return true; // Not a valid IP -> unsafe
}

/**
 * Resolves a hostname to all associated IP addresses (IPv4 & IPv6).
 */
export async function resolveHostIps(hostname: string): Promise<string[]> {
  const cleanHost = hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(cleanHost)) {
    return [cleanHost];
  }

  try {
    const results = await dns.lookup(cleanHost, { all: true });
    return results.map((r) => r.address);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`DNS resolution failed for "${cleanHost}": ${msg}`);
  }
}

/**
 * Validates a target URL against SSRF attack vectors:
 * - Protocol enforcement (only http/https; optional https only)
 * - Blocked hostnames & cloud metadata service endpoints
 * - DNS resolution and IP address range checks (IPv4 & IPv6)
 */
export async function validateDestinationUrl(
  rawUrl: string,
  options: { requireHttps?: boolean } = {}
): Promise<{ ok: boolean; url?: URL; error?: string; resolvedIps?: string[] }> {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { ok: false, error: "Empty or missing URL." };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false, error: "Malformed URL syntax." };
  }

  // Protocol check
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: `Invalid protocol "${parsed.protocol}". Only HTTP and HTTPS are permitted.` };
  }

  const isVercelProd =
    process.env.VERCEL === "1" ||
    Boolean(process.env.VERCEL_ENV) ||
    process.env.STRICT_SSRF === "1";

  if ((options.requireHttps || isVercelProd) && parsed.protocol !== "https:") {
    return { ok: false, error: "SSRF blocked: Production environments require secure HTTPS protocol." };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Hostname check
  if (isBlockedHostname(hostname)) {
    return {
      ok: false,
      error: `SSRF blocked: Target hostname "${hostname}" is private, internal, or cloud metadata.`,
    };
  }

  // DNS & IP resolution check
  let ips: string[];
  try {
    ips = await resolveHostIps(hostname);
  } catch (dnsErr) {
    return {
      ok: false,
      error: dnsErr instanceof Error ? dnsErr.message : "DNS resolution failure",
    };
  }

  if (!ips || ips.length === 0) {
    return { ok: false, error: `DNS returned 0 records for host "${hostname}".` };
  }

  for (const ip of ips) {
    if (isPrivateOrReservedIp(ip)) {
      return {
        ok: false,
        resolvedIps: ips,
        error: `SSRF blocked: Host "${hostname}" resolved to private or reserved IP "${ip}".`,
      };
    }
  }

  return { ok: true, url: parsed, resolvedIps: ips };
}

/**
 * SSRF-Safe Fetch:
 * - Validates target URL and resolves DNS before connecting
 * - Rejects loopback, private IPv4, private IPv6, and metadata addresses
 * - Follows redirects manually (`redirect: "manual"`) and re-validates each redirect target
 * - Enforces timeout and maximum response size
 * - Enforces allowed content types if specified
 */
export async function safeFetch(
  initialUrl: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
  const {
    timeoutMs = 15000,
    maxSizeBytes = 25 * 1024 * 1024,
    maxRedirects = 3,
    allowedContentTypes,
    requireHttps = false,
    headers = {},
  } = options;

  let currentUrl = initialUrl.trim();
  let redirectsCount = 0;

  while (redirectsCount <= maxRedirects) {
    // 1. Validate destination URL (syntax, hostname, DNS, and IP ranges)
    const check = await validateDestinationUrl(currentUrl, { requireHttps });
    if (!check.ok || !check.url) {
      throw new Error(check.error || "Destination URL failed SSRF validation.");
    }

    // 2. Execute fetch with manual redirect handling and timeout
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(currentUrl, {
        method: "GET",
        headers: {
          "User-Agent": "PLP-SafeFetcher/2.0",
          ...headers,
        },
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (fetchErr: unknown) {
      if (controller.signal.aborted) {
        throw new Error(`Fetch timed out after ${timeoutMs}ms.`);
      }
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      throw new Error(`Network connection failed: ${msg}`);
    } finally {
      clearTimeout(timeoutTimer);
    }

    // 3. Handle redirects manually to prevent SSRF bypasses via open redirects
    const isRedirect = [301, 302, 303, 307, 308].includes(res.status);
    if (isRedirect) {
      redirectsCount++;
      if (redirectsCount > maxRedirects) {
        throw new Error(`SSRF blocked: Maximum redirect limit (${maxRedirects}) exceeded.`);
      }

      const locationHeader = res.headers.get("location");
      if (!locationHeader) {
        throw new Error(`Redirect response (HTTP ${res.status}) missing Location header.`);
      }

      // Resolve relative redirect against current URL
      try {
        const nextUrl = new URL(locationHeader, currentUrl).href;
        currentUrl = nextUrl;
        continue;
      } catch {
        throw new Error(`Invalid redirect Location: "${locationHeader}".`);
      }
    }

    // 4. Validate successful HTTP response
    if (!res.ok) {
      throw new Error(`Remote server returned HTTP ${res.status} ${res.statusText}`);
    }

    // 5. Content-Type check if specified
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (allowedContentTypes && allowedContentTypes.length > 0) {
      const isAllowed = allowedContentTypes.some((type) => contentType.includes(type.toLowerCase()));
      if (!isAllowed) {
        throw new Error(
          `Unsupported Content-Type "${contentType}". Allowed: ${allowedContentTypes.join(", ")}.`
        );
      }
    }

    // 6. Content-Length header check
    const contentLengthHeader = res.headers.get("content-length");
    if (contentLengthHeader) {
      const cl = parseInt(contentLengthHeader, 10);
      if (!isNaN(cl) && cl > maxSizeBytes) {
        throw new Error(
          `Payload too large: Content-Length ${cl} bytes exceeds limit of ${maxSizeBytes} bytes.`
        );
      }
    }

    // 7. Stream / buffer read with size enforcement
    const arrayBuf = await res.arrayBuffer();
    if (arrayBuf.byteLength > maxSizeBytes) {
      throw new Error(
        `Payload too large: Received ${arrayBuf.byteLength} bytes, exceeding ${maxSizeBytes} bytes limit.`
      );
    }

    return {
      response: res,
      finalUrl: currentUrl,
      buffer: arrayBuf,
      contentType,
    };
  }

  throw new Error(`Too many redirects (max ${maxRedirects}).`);
}
