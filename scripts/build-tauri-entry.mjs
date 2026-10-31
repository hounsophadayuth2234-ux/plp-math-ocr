import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const srcEntry = path.join(rootDir, "src", "tauri-shell", "index.html");
const distDir = path.join(rootDir, "tauri-dist");
const distEntry = path.join(distDir, "index.html");

console.log("[Tauri Entry Builder] Starting static frontend compilation...");

if (!fs.existsSync(srcEntry)) {
  console.error("[Tauri Entry Builder] ERROR: Missing source entry at:", srcEntry);
  process.exit(1);
}

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Read and validate source entry
const content = fs.readFileSync(srcEntry, "utf-8");

// Strict security invariants check
const forbiddenPatterns = [
  /UPSTASH_REDIS_REST_URL/i,
  /KV_REST_API_URL/i,
  /APP_GATE_SESSION_SECRET/i,
  /ADMIN_RECOVERY_KEY/i,
  /GOOGLE_SERVICE_ACCOUNT_JSON/i,
  /GEMINI_API_KEY/i,
  /REPLICATE_API_TOKEN/i,
  /JWT_SECRET/i
];

for (const pattern of forbiddenPatterns) {
  if (pattern.test(content)) {
    console.error("[Tauri Entry Builder] CRITICAL SECURITY REJECTION: Forbidden server secret pattern detected:", pattern);
    process.exit(1);
  }
}

// Copy to tauri-dist
fs.writeFileSync(distEntry, content, "utf-8");
console.log(`[Tauri Entry Builder] SUCCESS: Output written to ${distEntry} (${content.length} bytes)`);

