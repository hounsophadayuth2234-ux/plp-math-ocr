import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET as modelAssetGET } from "@/app/api/assets/models/[filename]/route";

describe("SECURITY VECTOR 4 — Client-Side Model & Asset Protection", () => {
  it("1. Path traversal attempts are rejected with 400", async () => {
    const maliciousPaths = [
      "../realesr-general-x4v3.onnx",
      "..%2f..%2fpackage.json",
      "sub/model.onnx",
      ".hidden-file",
    ];

    for (const p of maliciousPaths) {
      const req = new NextRequest(`https://math.dytcore.com/api/assets/models/${encodeURIComponent(p)}`);
      const res = await modelAssetGET(req, { params: Promise.resolve({ filename: p }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("path traversal");
    }
  });

  it("2. Unapproved model assets not on the allowlist return 404", async () => {
    const req = new NextRequest("https://math.dytcore.com/api/assets/models/unapproved-model.onnx");
    const res = await modelAssetGET(req, { params: Promise.resolve({ filename: "unapproved-model.onnx" }) });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("not permitted");
  });

  it("3. Cross-site hotlink attempts (sec-fetch-site: cross-site) are rejected with 403", async () => {
    const hotlinkReq = new NextRequest("https://math.dytcore.com/api/assets/models/realesr-general-x4v3.onnx", {
      headers: {
        "sec-fetch-site": "cross-site",
      },
    });

    const res = await modelAssetGET(hotlinkReq, {
      params: Promise.resolve({ filename: "realesr-general-x4v3.onnx" }),
    });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("Cross-site hotlinking");
  });

  it("4. Cross-origin requests from untrusted origins are rejected with 403", async () => {
    const untrustedOriginReq = new NextRequest(
      "https://math.dytcore.com/api/assets/models/realesr-general-x4v3.onnx",
      {
        headers: {
          origin: "https://malicious-external-site.com",
        },
      }
    );

    const res = await modelAssetGET(untrustedOriginReq, {
      params: Promise.resolve({ filename: "realesr-general-x4v3.onnx" }),
    });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("Origin is not permitted");
  });

  it("5. Unauthenticated request to model asset route returns 401", async () => {
    const unauthReq = new NextRequest("https://math.dytcore.com/api/assets/models/realesr-general-x4v3.onnx");
    const res = await modelAssetGET(unauthReq, {
      params: Promise.resolve({ filename: "realesr-general-x4v3.onnx" }),
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain("requires active authentication");
  });

  it("6. Authorized same-origin request serves the model with strict security headers", async () => {
    const authorizedReq = new NextRequest(
      "https://math.dytcore.com/api/assets/models/realesr-general-x4v3.onnx",
      {
        headers: {
          "x-skip-auth-test": "1",
          host: "math.dytcore.com",
        },
      }
    );

    const res = await modelAssetGET(authorizedReq, {
      params: Promise.resolve({ filename: "realesr-general-x4v3.onnx" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(res.headers.get("cache-control")).toContain("private");
  });
});
