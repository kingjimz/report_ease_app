/**
 * Avatar helpers shared by the team map's Leaflet pins and the member sheet.
 *
 * Both need the same colour for the same person, so the derivation has to live
 * in one place: a pin and the sheet that opens from it looking different for
 * the same member reads as a bug.
 */

/**
 * Stable colour per user. Deliberately a hash rather than stored state, so a
 * member keeps their colour across devices and sessions with nothing persisted.
 */
const PALETTE = ['#059669', '#2563eb', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777'];

export function avatarColorFor(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

/** First letter of a display name, for the photo-less fallback. */
export function avatarInitial(displayName: string | null | undefined): string {
  return escapeHtml((displayName || '?').charAt(0).toUpperCase());
}

/**
 * Escape for interpolation into a Leaflet divIcon's raw HTML string. Display
 * names and photo URLs come from other users' Firestore docs, so they are
 * untrusted input even inside a private group.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
