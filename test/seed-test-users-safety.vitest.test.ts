import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import path from "path";

describe("Safety Invariant: seed-test-users Production Refusal", () => {
  const seedScriptPath = path.resolve("tests/seed-test-users.js");

  it("1. Refuses to run and exits with code 1 if UPSTASH_REDIS_REST_URL is set", () => {
    let error: any = null;
    try {
      execSync(`node "${seedScriptPath}"`, {
        env: {
          ...process.env,
          UPSTASH_REDIS_REST_URL: "https://test-prod-redis.upstash.io",
        },
        stdio: "pipe",
      });
    } catch (err: any) {
      error = err;
    }

    expect(error).not.toBeNull();
    expect(error.status).toBe(1);
    const stderr = error.stderr.toString();
    expect(stderr).toContain("seed-test-users REFUSES to execute");
    expect(stderr).toContain("Production Redis");
  });

  it("2. Refuses to run and exits with code 1 if KV_REST_API_URL is set", () => {
    let error: any = null;
    try {
      execSync(`node "${seedScriptPath}"`, {
        env: {
          ...process.env,
          KV_REST_API_URL: "https://test-kv.vercel-storage.com",
        },
        stdio: "pipe",
      });
    } catch (err: any) {
      error = err;
    }

    expect(error).not.toBeNull();
    expect(error.status).toBe(1);
    const stderr = error.stderr.toString();
    expect(stderr).toContain("seed-test-users REFUSES to execute");
  });

  it("3. Refuses to run and exits with code 1 if NODE_ENV is production without explicit override", () => {
    let error: any = null;
    try {
      execSync(`node "${seedScriptPath}"`, {
        env: {
          ...process.env,
          NODE_ENV: "production",
          ALLOW_E2E_SEED: "",
        },
        stdio: "pipe",
      });
    } catch (err: any) {
      error = err;
    }

    expect(error).not.toBeNull();
    expect(error.status).toBe(1);
    const stderr = error.stderr.toString();
    expect(stderr).toContain("seed-test-users REFUSES to execute");
  });

  it("4. Succeeds when in test/dev environment without production Redis URLs", () => {
    const output = execSync(`node "${seedScriptPath}"`, {
      env: {
        ...process.env,
        UPSTASH_REDIS_REST_URL: "",
        KV_REST_API_URL: "",
        NODE_ENV: "development",
      },
      stdio: "pipe",
    }).toString();

    expect(output).toContain("[seed-test-users] Successfully wrote");
  });
});
