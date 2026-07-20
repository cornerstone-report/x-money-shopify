/** Strip a leading @ from an X handle and trim. */
export function normalizeXHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "");
}

/** Basic handle validation: letters, numbers, underscore; 1–15 chars. */
export function isValidXHandle(handle: string): boolean {
  if (!handle) return true; // empty allowed (clear settings)
  return /^[A-Za-z0-9_]{1,15}$/.test(handle);
}
