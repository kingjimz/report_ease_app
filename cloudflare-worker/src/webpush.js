/**
 * Web Push sender for Cloudflare Workers, implemented with the built-in Web
 * Crypto API (no Node, no npm dependency). Two specs are at play:
 *
 *   RFC 8291 — Message Encryption for Web Push (aes128gcm content coding)
 *   RFC 8292 — VAPID: voluntary application server identification
 *
 * Usage:
 *   await sendWebPush(subscription, JSON.stringify(payload), {
 *     vapidPublicKey, vapidPrivateKey, subject, ttl
 *   })
 *
 * `subscription` is the raw PushSubscription JSON the browser produced:
 *   { endpoint, keys: { p256dh, auth } }
 *
 * Returns the fetch Response so the caller can prune on 404/410 (expired).
 */

/* ------------------------------ base64url ------------------------------ */

function b64urlToBytes(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes) {
  let bin = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concatBytes(...chunks) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

const utf8 = (s) => new TextEncoder().encode(s);

/* -------------------------------- VAPID -------------------------------- */

/**
 * Build the `Authorization: vapid t=<jwt>, k=<pubkey>` header for an endpoint.
 * The private key is the raw 32-byte P-256 scalar (base64url) that
 * `web-push generate-vapid-keys` emits; the public key is the raw 65-byte
 * uncompressed point (base64url).
 */
async function buildVapidAuth(endpoint, vapidPublicKey, vapidPrivateKey, subject) {
  const audience = new URL(endpoint).origin;
  const header = { typ: 'JWT', alg: 'ES256' };
  // Expiry must be <= 24h out per RFC 8292; use 12h for clock-skew slack.
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
  const payload = { aud: audience, exp, sub: subject };

  const signingInput =
    bytesToB64url(utf8(JSON.stringify(header))) +
    '.' +
    bytesToB64url(utf8(JSON.stringify(payload)));

  const key = await importVapidPrivateKey(vapidPrivateKey, vapidPublicKey);
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    utf8(signingInput),
  );
  // Web Crypto already returns the JOSE r||s signature (64 bytes) for ECDSA.
  const jwt = signingInput + '.' + bytesToB64url(new Uint8Array(sig));
  return `vapid t=${jwt}, k=${vapidPublicKey}`;
}

/**
 * Import the VAPID private scalar as an ECDSA signing key. Web Crypto needs a
 * full JWK, so the public point (x, y) is recovered from the 65-byte public key.
 */
async function importVapidPrivateKey(privateB64url, publicB64url) {
  const pub = b64urlToBytes(publicB64url); // 0x04 || x(32) || y(32)
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: privateB64url.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'),
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    ext: true,
  };
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

/* ----------------------------- Encryption ------------------------------ */

async function hkdf(salt, ikm, info, length) {
  const baseKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    baseKey,
    length * 8,
  );
  return new Uint8Array(bits);
}

/**
 * Encrypt `plaintext` (Uint8Array) for the subscription using the aes128gcm
 * content coding. Returns the full message body (header || single record).
 */
async function encryptPayload(plaintext, p256dhB64url, authB64url) {
  const uaPublic = b64urlToBytes(p256dhB64url); // receiver public key, 65 bytes
  const authSecret = b64urlToBytes(authB64url); // 16 bytes

  // Ephemeral application-server ECDH keypair.
  const asKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const asPublic = new Uint8Array(
    await crypto.subtle.exportKey('raw', asKeyPair.publicKey),
  ); // 65 bytes

  // ECDH shared secret with the user-agent public key.
  const uaPublicKey = await crypto.subtle.importKey(
    'raw',
    uaPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaPublicKey },
      asKeyPair.privateKey,
      256,
    ),
  );

  // RFC 8291 §3.4: derive the input keying material from the shared secret,
  // salted by the auth secret, with key_info binding both public keys.
  const keyInfo = concatBytes(
    utf8('WebPush: info\0'),
    uaPublic,
    asPublic,
  );
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);

  // RFC 8188 aes128gcm: random 16-byte salt, then CEK and nonce.
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);

  // Single record: plaintext followed by the 0x02 padding delimiter.
  const padded = concatBytes(plaintext, new Uint8Array([0x02]));
  const aesKey = await crypto.subtle.importKey(
    'raw',
    cek,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      aesKey,
      padded,
    ),
  );

  // aes128gcm header: salt(16) || rs(4, big-endian) || idlen(1) || keyid(asPublic).
  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = asPublic.length;
  header.set(asPublic, 21);

  return concatBytes(header, ciphertext);
}

/* ------------------------------- Sender -------------------------------- */

/**
 * Encrypt and POST a single push message. `payload` is a string (typically
 * JSON). Resolves with the raw fetch Response.
 */
export async function sendWebPush(subscription, payload, opts) {
  const { vapidPublicKey, vapidPrivateKey, subject, ttl = 12 * 60 * 60 } = opts;
  const body = await encryptPayload(
    utf8(payload),
    subscription.keys.p256dh,
    subscription.keys.auth,
  );
  const authorization = await buildVapidAuth(
    subscription.endpoint,
    vapidPublicKey,
    vapidPrivateKey,
    subject,
  );

  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: 'normal',
    },
    body,
  });
}
