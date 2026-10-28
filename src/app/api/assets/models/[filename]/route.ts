import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getSessionUser } from "@/lib/auth-session";
import { isAllowedStateChangingOrigin } from "@/lib/auth-csrf";


/**
 * Strict allowlist of authorized client-side ML model assets.
 * Arbitrary file reads or unapproved model downloads are strictly forbidden.
 */
const ALLOWED_MODELS = new Set([
  "realesr-general-x4v3.onnx",
]);

interface RouteParams {
  params: Promise<{ filename: string }>;
}

/**
 * GET /api/assets/models/[filename]
 *
 * Controlled defense-in-depth asset delivery endpoint for ML models:
 * - Requires active gate session authentication
 * - Strictly prevents path traversal attacks
 * - Blocks cross-origin hotlinking
 * - Sets strict private caching and MIME security headers
 *
 * NOTE: For client-side models, weights are executed in the browser;
 * copying by a determined user with full browser devtools cannot be fully prevented.
 * Defense-in-depth controls prevent unauthorized third-party hotlinking and automated scrapers.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { filename } = await params;

  // 1. Path Traversal & Sanity Check
  if (
    !filename ||
    filename.includes("..") ||
    filename.includes("/") ||
    filename.includes("\\") ||
    filename.startsWith(".")
  ) {
    return NextResponse.json(
      { error: "Invalid asset filename or path traversal detected." },
      { status: 400 }
    );
  }

  // 2. Strict Allowlist Enforcement
  if (!ALLOWED_MODELS.has(filename)) {
    return NextResponse.json(
      { error: "Requested model asset is not found or not permitted." },
      { status: 404 }
    );
  }

  // 3. Hotlink Protection: Reject cross-site fetch requests
  const secFetchSite = req.headers.get("sec-fetch-site");
  if (secFetchSite === "cross-site") {
    return NextResponse.json(
      { error: "Forbidden: Cross-site hotlinking of model assets is prohibited." },
      { status: 403 }
    );
  }

  // Reject untrusted origins
  const origin = req.headers.get("origin");
  if (origin && !isAllowedStateChangingOrigin(req)) {
    return NextResponse.json(
      { error: "Forbidden: Origin is not permitted to load model assets." },
      { status: 403 }
    );
  }

  // 4. Authentication Check: Ensure user has valid active session
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized: Accessing model assets requires active authentication." },
      { status: 401 }
    );
  }

  // 5. Resolve and verify physical file on disk
  const filePath = path.join(process.cwd(), "public", "models", filename);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json(
      { error: "Model asset file not found on server storage." },
      { status: 404 }
    );
  }

  const stat = fs.statSync(filePath);
  const fileStream = fs.createReadStream(filePath);

  // Convert Node ReadStream to Web ReadableStream
  const webStream = new ReadableStream({
    start(controller) {
      fileStream.on("data", (chunk) => controller.enqueue(chunk));
      fileStream.on("end", () => controller.close());
      fileStream.on("error", (err) => controller.error(err));
    },
    cancel() {
      fileStream.destroy();
    },
  });

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(stat.size),
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
