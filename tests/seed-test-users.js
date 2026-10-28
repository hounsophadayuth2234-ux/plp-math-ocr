import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { resolveE2ECredentials } from "./test-credentials-resolver.js";

// Safety Invariant: Refuse execution if connected to external Upstash Redis, Vercel KV, or production NODE_ENV
if (
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.KV_REST_API_URL ||
  (process.env.NODE_ENV === "production" && process.env.ALLOW_E2E_SEED !== "true")
) {
  console.error(
    "[FATAL ERROR] seed-test-users REFUSES to execute: Production Redis or production NODE_ENV detected."
  );
  process.exit(1);
}

const scratchDir = path.join(process.cwd(), "scratch");
if (!fs.existsSync(scratchDir)) {
  fs.mkdirSync(scratchDir, { recursive: true });
}
const usersFile = path.join(scratchDir, "users-persistent.json");

let existingUsers = [];
if (fs.existsSync(usersFile)) {
  try {
    existingUsers = JSON.parse(fs.readFileSync(usersFile, "utf-8"));
  } catch {}
}

const now = Date.now();
const creds = resolveE2ECredentials();

const testUsers = [
  {
    id: "usr_t33rx0x6mvs5qy0a",
    username: creds.superadmin.username,
    email: `${creds.superadmin.username}@dyt-ecosystem.local`,
    displayName: "Dynamic E2E Super Admin",
    passwordHash: bcrypt.hashSync(creds.superadmin.password, 10),
    role: "SUPER_ADMIN",
    status: "ACTIVE",
    mustChangePassword: false,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "usr_c6gqttx7mvs5qy6q",
    username: creds.user.username,
    email: `${creds.user.username}@dyt-ecosystem.local`,
    displayName: "Dynamic E2E Normal User",
    passwordHash: bcrypt.hashSync(creds.user.password, 10),
    role: "USER",
    status: "ACTIVE",
    mustChangePassword: false,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "usr_susp_superadmin",
    username: `suspended_${crypto.randomBytes(4).toString("hex")}`,
    email: "suspended_user@dyt-ecosystem.local",
    displayName: "Suspended Super Admin",
    passwordHash: bcrypt.hashSync(crypto.randomBytes(16).toString("hex"), 10),
    role: "SUPER_ADMIN",
    status: "DISABLED",
    mustChangePassword: false,
    createdAt: now,
    updatedAt: now,
  },
];

for (const tu of testUsers) {
  const idx = existingUsers.findIndex(
    (u) => u.id === tu.id || u.username.toLowerCase() === tu.username.toLowerCase()
  );
  if (idx >= 0) {
    existingUsers[idx] = { ...existingUsers[idx], ...tu };
  } else {
    existingUsers.push(tu);
  }
}

fs.writeFileSync(usersFile, JSON.stringify(existingUsers, null, 2), "utf-8");
console.log(`[seed-test-users] Successfully wrote ${existingUsers.length} users to ${usersFile}`);
