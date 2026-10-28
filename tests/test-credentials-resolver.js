import fs from "fs";
import path from "path";
import crypto from "crypto";

const CREDS_FILE = path.join(process.cwd(), ".test-credentials.json");

export function resolveE2ECredentials() {
  const envSuperUser = process.env.E2E_SUPERADMIN_USERNAME?.trim();
  const envSuperPass = process.env.E2E_SUPERADMIN_PASSWORD?.trim();
  const envNormUser = process.env.E2E_USER_USERNAME?.trim();
  const envNormPass = process.env.E2E_USER_PASSWORD?.trim();

  let stored = {};
  if (fs.existsSync(CREDS_FILE)) {
    try {
      stored = JSON.parse(fs.readFileSync(CREDS_FILE, "utf-8"));
    } catch {}
  }

  const superUsername =
    envSuperUser ||
    stored.superadmin?.username ||
    `e2e_sa_${crypto.randomBytes(4).toString("hex")}`;
  const superPassword =
    envSuperPass ||
    stored.superadmin?.password ||
    `E2ESuper_${crypto.randomBytes(8).toString("hex")}!`;

  const normalUsername =
    envNormUser ||
    stored.user?.username ||
    `e2e_usr_${crypto.randomBytes(4).toString("hex")}`;
  const normalPassword =
    envNormPass ||
    stored.user?.password ||
    `E2EUser_${crypto.randomBytes(8).toString("hex")}!`;

  const credentials = {
    superadmin: {
      username: superUsername,
      password: superPassword,
    },
    user: {
      username: normalUsername,
      password: normalPassword,
    },
  };

  // Persist generated credentials only if they were missing or updated
  try {
    fs.writeFileSync(CREDS_FILE, JSON.stringify(credentials, null, 2), "utf-8");
  } catch {}

  return credentials;
}
