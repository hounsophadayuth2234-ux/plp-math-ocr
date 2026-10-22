/**
 * Password validation and strength assessment rules
 * Complies with enterprise security requirements:
 * - Minimum 10 characters
 * - Mixture of character classes (lowercase, uppercase, numbers, symbols)
 * - Rejection of common weak passwords
 */

const COMMON_WEAK_PASSWORDS = new Set([
  "password",
  "password123",
  "admin12345",
  "1234567890",
  "123456789",
  "qwertyuiop",
  "letmein123",
  "welcome123",
  "administrator",
  "changeme123",
  "dytpassword",
  "iloveyou123",
]);

export interface PasswordValidationResult {
  valid: boolean;
  score: number; // 0 to 4
  strengthLabel: "Weak" | "Fair" | "Good" | "Strong";
  errors: string[];
}

export function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (!password || typeof password !== "string") {
    return {
      valid: false,
      score: 0,
      strengthLabel: "Weak",
      errors: ["ពាក្យសម្ងាត់មិនអាចទទេបានទេ (Password is required)"],
    };
  }

  // 1. Length check: Minimum 10 characters
  if (password.length < 10) {
    errors.push("ពាក្យសម្ងាត់ត្រូវតែមានយ៉ាងតិច 10 តួអក្សរ (Password must be at least 10 characters)");
  }

  // 2. Common password rejection
  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase().trim())) {
    errors.push("ពាក្យសម្ងាត់នេះសាមញ្ញពេក សូមជ្រើសរើសពាក្យសម្ងាត់ពិបាកស្មានជាងនេះ (Password is too common)");
  }

  // 3. Character class mixture
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);

  let typesCount = 0;
  if (hasLower) typesCount++;
  if (hasUpper) typesCount++;
  if (hasDigit) typesCount++;
  if (hasSpecial) typesCount++;

  if (typesCount < 3) {
    errors.push(
      "ត្រូវតែមានការរួមបញ្ចូលគ្នាយ៉ាងហោចណាស់ 3 ប្រភេទ (អក្សរតូច អក្សរធំ លេខ ឬនិមិត្តសញ្ញា) (Must include at least 3 character types: lowercase, uppercase, numbers, or symbols)"
    );
  }

  // Calculate score (0-4)
  let score = 0;
  if (password.length >= 10) score++;
  if (password.length >= 14) score++;
  if (typesCount >= 3) score++;
  if (typesCount === 4 && password.length >= 12) score++;

  let strengthLabel: "Weak" | "Fair" | "Good" | "Strong" = "Weak";
  if (score >= 4) strengthLabel = "Strong";
  else if (score === 3) strengthLabel = "Good";
  else if (score === 2) strengthLabel = "Fair";

  return {
    valid: errors.length === 0,
    score,
    strengthLabel,
    errors,
  };
}

/**
 * Practical password policy for Admin-managed account creation, resets, and self-change:
 * - Minimum 8 characters
 * - Allows letters, numbers, spaces, and common symbols
 * - Does not require excessive combinations of classes
 * - Rejects only:
 *   1. empty password
 *   2. fewer than 8 characters
 *   3. password equal to username
 *   4. obvious/common passwords (password, 12345678, qwerty, admin, etc.)
 *   5. confirm password mismatch
 */
export function validateAdminManagedPassword(
  password: string,
  username?: string,
  confirmPassword?: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!password || typeof password !== "string") {
    errors.push("ពាក្យសម្ងាត់មិនអាចទទេបានទេ (Password is required)");
    return { valid: false, errors };
  }

  // 1. Minimum 8 characters
  if (password.length < 8) {
    errors.push("ពាក្យសម្ងាត់ត្រូវមានយ៉ាងហោចណាស់ ៨ តួអក្សរ (Password must be at least 8 characters)");
  }

  // 2. Reject if password matches username
  if (username && password.toLowerCase().trim() === username.toLowerCase().trim()) {
    errors.push("ពាក្យសម្ងាត់មិនអាចដូចឈ្មោះអ្នកប្រើបានទេ (Password cannot be equal to username)");
  }

  // 3. Reject obvious / common passwords
  const normalized = password.toLowerCase().trim();
  const obviousWeak = new Set([
    "password",
    "password123",
    "12345678",
    "123456789",
    "1234567890",
    "qwerty",
    "qwertyuiop",
    "admin",
    "admin123",
    "admin12345",
    "welcome123",
    "letmein123",
    "changeme123",
    "dytpassword",
  ]);

  if (obviousWeak.has(normalized)) {
    errors.push("ពាក្យសម្ងាត់នេះងាយស្មានពេក (Password is too common or obvious)");
  }

  // 4. Confirm password match if provided
  if (confirmPassword !== undefined && password !== confirmPassword) {
    errors.push("ពាក្យសម្ងាត់ទាំងពីរមិនដូចគ្នា (Passwords do not match)");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generates a cryptographically strong random temporary password
 * Meets all strength requirements: 16 chars with mixed classes.
 */
export function generateTemporaryPassword(): string {
  const charsLower = "abcdefghjkmnpqrstuvwxyz";
  const charsUpper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const charsNumbers = "23456789";
  const charsSymbols = "!@#$%^&*()-_=+";

  const all = charsLower + charsUpper + charsNumbers + charsSymbols;
  const randomValues = new Uint32Array(16);
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(randomValues);
  } else {
    for (let i = 0; i < 16; i++) {
      randomValues[i] = Math.floor(Math.random() * 0xffffffff);
    }
  }

  // Guarantee at least one of each class
  const result: string[] = [
    charsLower[randomValues[0] % charsLower.length],
    charsUpper[randomValues[1] % charsUpper.length],
    charsNumbers[randomValues[2] % charsNumbers.length],
    charsSymbols[randomValues[3] % charsSymbols.length],
  ];

  for (let i = 4; i < 16; i++) {
    result.push(all[randomValues[i] % all.length]);
  }

  // Fisher-Yates shuffle
  const shuffleValues = new Uint32Array(16);
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(shuffleValues);
  } else {
    for (let i = 0; i < 16; i++) {
      shuffleValues[i] = Math.floor(Math.random() * 0xffffffff);
    }
  }
  for (let i = result.length - 1; i > 0; i--) {
    const j = shuffleValues[i] % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result.join("");
}
