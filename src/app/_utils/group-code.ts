/**
 * Group share codes.
 *
 * A group's Firestore document ID *is* its share code, so codes must be safe to
 * read aloud, type on a phone, and use as a path segment. The alphabet drops
 * every look-alike pair (0/O, 1/I/L) and the code is always uppercase.
 *
 * 31^8 is roughly 8.5e11 combinations, so guessing a live group is not a
 * practical attack.
 */

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const GROUP_CODE_LENGTH = 8;

/** Characters people commonly type instead of the real thing. */
const LOOKALIKES: Record<string, string> = {
  '0': 'O',
  O: 'O',
  '1': 'J',
  I: 'J',
  L: 'J',
};

/**
 * Generate a fresh code. Uses crypto.getRandomValues rather than Math.random:
 * the code is the only thing standing between a stranger and a group.
 *
 * Rejection sampling keeps the distribution flat - 256 is not a multiple of 31,
 * so plain modulo would bias the first few letters.
 */
export function generateGroupCode(): string {
  const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  let code = '';
  const buffer = new Uint8Array(GROUP_CODE_LENGTH * 2);
  while (code.length < GROUP_CODE_LENGTH) {
    crypto.getRandomValues(buffer);
    for (const byte of buffer) {
      if (byte >= max) continue;
      code += ALPHABET[byte % ALPHABET.length];
      if (code.length === GROUP_CODE_LENGTH) break;
    }
  }
  return code;
}

/** Display form: ABCD-EFGH. Never stored, only shown. */
export function formatGroupCode(code: string): string {
  const half = Math.ceil(GROUP_CODE_LENGTH / 2);
  return code.length === GROUP_CODE_LENGTH ? `${code.slice(0, half)}-${code.slice(half)}` : code;
}

/**
 * Turn whatever the user typed or pasted into a candidate document ID: strip
 * separators and whitespace, uppercase, then fold look-alikes so someone who
 * types a zero for the letter O still lands on the right group.
 */
export function normalizeGroupCode(input: string): string {
  const cleaned = (input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let out = '';
  for (const char of cleaned) {
    out += LOOKALIKES[char] ?? char;
  }
  return out;
}

/** True when the input could be a real code. Cheap guard before hitting Firestore. */
export function isValidGroupCode(code: string): boolean {
  if (code.length !== GROUP_CODE_LENGTH) return false;
  for (const char of code) {
    if (!ALPHABET.includes(char)) return false;
  }
  return true;
}
