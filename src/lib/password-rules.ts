/**
 * Simple, practical password rules across the PLP MATH CONTENT / DYT ECOSYSTEM platform.
 *
 * Rules:
 * - At least 4 characters.
 * - Allow English letters and numbers (mixed, letters-only, numbers-only).
 * - Do not require uppercase letters, lowercase letters, or special symbols.
 * - Require confirmation password to match exactly when provided.
 *
 * Validation messages:
 * - "ឈ្មោះអ្នកប្រើប្រាស់ត្រូវមានយ៉ាងហោចណាស់ ៤ តួអក្សរ"
 * - "ពាក្យសម្ងាត់ត្រូវមានយ៉ាងហោចណាស់ ៤ តួអក្សរ"
 * - "ពាក្យសម្ងាត់ទាំងពីរមិនដូចគ្នា"
 * - "សូមបញ្ចូលឈ្មោះអ្នកប្រើប្រាស់"
 * - "សូមបញ្ចូលពាក្យសម្ងាត់"
 */

export interface PasswordValidationResult {
  valid: boolean;
  score: number; // 0 to 4
  strengthLabel: "Weak" | "Fair" | "Good" | "Strong";
  errors: string[];
}

/**
 * Validates password meets the simple 4-character requirement.
 */
export function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (!password || typeof password !== "string" || !password.trim()) {
    return {
      valid: false,
      score: 0,
      strengthLabel: "Weak",
      errors: ["សូមបញ្ចូលពាក្យសម្ងាត់ (Password is required)"],
    };
  }

  if (password.length < 4) {
    errors.push("ពាក្យសម្ងាត់ត្រូវមានយ៉ាងហោចណាស់ ៤ តួអក្សរ (Password must be at least 4 characters)");
  }

  const valid = errors.length === 0;
  return {
    valid,
    score: valid ? (password.length >= 8 ? 4 : 3) : 0,
    strengthLabel: valid ? "Strong" : "Weak",
    errors,
  };
}

/**
 * Validates admin-managed password creation/reset:
 * - Minimum 4 characters
 * - Letters and/or numbers
 * - Optional confirmation password match
 */
export function validateAdminManagedPassword(
  password: string,
  _username?: string,
  confirmPassword?: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!password || typeof password !== "string" || !password.trim()) {
    errors.push("សូមបញ្ចូលពាក្យសម្ងាត់ (Password is required)");
    return { valid: false, errors };
  }

  // 1. Minimum 4 characters
  if (password.length < 4) {
    errors.push("ពាក្យសម្ងាត់ត្រូវមានយ៉ាងហោចណាស់ ៤ តួអក្សរ (Password must be at least 4 characters)");
  }

  // 2. Confirm password match if provided
  if (confirmPassword !== undefined && password !== confirmPassword) {
    errors.push("ពាក្យសម្ងាត់ទាំងពីរមិនដូចគ្នា (Passwords do not match)");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generates a simple, practical random temporary password (8 alphanumeric characters).
 */
export function generateTemporaryPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  const randomValues = new Uint32Array(8);

  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(randomValues);
  } else {
    for (let i = 0; i < 8; i++) {
      randomValues[i] = Math.floor(Math.random() * 0xffffffff);
    }
  }

  for (let i = 0; i < 8; i++) {
    result += chars[randomValues[i] % chars.length];
  }

  return result;
}
