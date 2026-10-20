import crypto from "crypto";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";

// Generate a high-entropy, new unexposed password
// 24 random bytes base64url = ~32 characters with 192 bits of entropy
const newPlainPassword = crypto.randomBytes(24).toString("base64url") + "!DytGate2026";

// Hash the password with bcrypt (12 salt rounds)
const passwordHash = bcrypt.hashSync(newPlainPassword, 12);

// Generate a 64-byte cryptographic hex string for signing session cookies
const sessionSecret = crypto.randomBytes(64).toString("hex");

// Generate a 32-byte recovery key
const adminRecoveryKey = crypto.randomBytes(32).toString("hex");

const envPath = path.join(process.cwd(), ".env.local");
let envContent = "";
if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, "utf-8");
}

function updateOrAppend(content, key, value) {
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    return content.replace(regex, `${key}=${value}`);
  } else {
    return `${content.trim()}\n${key}=${value}\n`;
  }
}

envContent = updateOrAppend(envContent, "APP_GATE_PASSWORD_HASH", passwordHash);
envContent = updateOrAppend(envContent, "APP_GATE_SESSION_SECRET", sessionSecret);
envContent = updateOrAppend(envContent, "APP_GATE_ADMIN_RECOVERY_KEY", adminRecoveryKey);

fs.writeFileSync(envPath, envContent, "utf-8");

// Save the secure unprinted credential file locally for user handoff (restricted chmod)
const secureHandoffPath = path.join(process.cwd(), ".gate-credentials-handoff.json");
fs.writeFileSync(
  secureHandoffPath,
  JSON.stringify(
    {
      instructions: "Keep this file private. It is excluded by git. Delete after setting in password manager.",
      generatedAt: new Date().toISOString(),
      plainPassword: newPlainPassword,
      passwordHash: passwordHash,
      sessionSecret: sessionSecret,
      adminRecoveryKey: adminRecoveryKey,
    },
    null,
    2
  ),
  { encoding: "utf-8", mode: 0o600 }
);

// DO NOT PRINT THE PASSWORD VALUE TO STDOUT
console.log("[credentials-generator] Success: APP_GATE_PASSWORD_HASH, APP_GATE_SESSION_SECRET, and APP_GATE_ADMIN_RECOVERY_KEY successfully generated and stored in .env.local.");
console.log("[credentials-generator] Secure handoff file generated at .gate-credentials-handoff.json (Zero secrets printed to terminal).");
