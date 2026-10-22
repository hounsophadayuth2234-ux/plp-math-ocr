/**
 * Strict request payload validators for Authentication and User Administration
 * Sanitizes and validates fields to prevent injection, schema pollution, and invalid formats.
 */

export interface ValidationIssue {
  field: string;
  message: string;
}

export function validateUsername(username: unknown): { valid: boolean; value?: string; error?: string } {
  if (typeof username !== "string" || !username.trim()) {
    return { valid: false, error: "ឈ្មោះអ្នកប្រើប្រាស់មិនអាចទទេបានទេ (Username is required)" };
  }
  const clean = username.trim().toLowerCase();
  if (clean.length < 3 || clean.length > 30) {
    return { valid: false, error: "ឈ្មោះអ្នកប្រើប្រាស់ត្រូវតែមានចន្លោះ 3 ដល់ 30 តួអក្សរ (Username must be 3-30 characters)" };
  }
  if (!/^[a-z0-9_.-]+$/.test(clean)) {
    return { valid: false, error: "ឈ្មោះអ្នកប្រើប្រាស់អាចផ្ទុកតែអក្សរ លេខ សញ្ញាចុច និងសញ្ញា _ (Username can only contain a-z, 0-9, _, -, .)" };
  }
  return { valid: true, value: clean };
}

export function validateEmail(email: unknown): { valid: boolean; value?: string; error?: string } {
  if (typeof email !== "string" || !email.trim()) {
    return { valid: false, error: "អ៊ីមែលមិនអាចទទេបានទេ (Email is required)" };
  }
  const clean = email.trim().toLowerCase();
  if (clean.length > 100) {
    return { valid: false, error: "អ៊ីមែលវែងពេក (Email exceeds max length)" };
  }
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(clean)) {
    return { valid: false, error: "ទម្រង់អ៊ីមែលមិនត្រឹមត្រូវទេ (Invalid email address)" };
  }
  return { valid: true, value: clean };
}

export function validateDisplayName(name: unknown): { valid: boolean; value?: string; error?: string } {
  if (typeof name !== "string" || !name.trim()) {
    return { valid: false, error: "ឈ្មោះបង្ហាញមិនអាចទទេបានទេ (Display name is required)" };
  }
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 60) {
    return { valid: false, error: "ឈ្មោះបង្ហាញត្រូវតែមានចន្លោះ 2 ដល់ 60 តួអក្សរ (Display name must be 2-60 characters)" };
  }
  return { valid: true, value: clean };
}

export function validateRole(role: unknown): { valid: boolean; value?: "ADMIN" | "USER"; error?: string } {
  if (role === "ADMIN" || role === "USER") {
    return { valid: true, value: role };
  }
  return { valid: false, error: "តួនាទីមិនត្រឹមត្រូវ (Role must be either ADMIN or USER)" };
}

export function validateStatus(status: unknown): { valid: boolean; value?: "ACTIVE" | "DISABLED"; error?: string } {
  if (status === "ACTIVE" || status === "DISABLED") {
    return { valid: true, value: status };
  }
  return { valid: false, error: "ស្ថានភាពមិនត្រឹមត្រូវ (Status must be either ACTIVE or DISABLED)" };
}
