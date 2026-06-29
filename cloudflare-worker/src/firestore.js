/**
 * Minimal Firestore REST client for Cloudflare Workers, authenticated with a
 * Firebase service account. No Admin SDK (Node-only); everything runs on the
 * Web Crypto API and fetch.
 *
 * The service-account JSON (Console > Project Settings > Service Accounts >
 * Generate new private key) is stored whole as the FIREBASE_SERVICE_ACCOUNT
 * Worker secret. Only client_email, private_key, token_uri and project_id are
 * used.
 */

/* ------------------------------ base64url ------------------------------ */

function bytesToB64url(bytes) {
  let bin = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const utf8 = (s) => new TextEncoder().encode(s);

/* --------------------------- Service account --------------------------- */

/**
 * Import the PKCS#8 PEM private key from the service account for RS256 signing.
 */
async function importServiceAccountKey(pem) {
  const body = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  return crypto.subtle.importKey(
    'pkcs8',
    der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/**
 * Exchange a signed service-account JWT for a short-lived OAuth2 access token
 * scoped to Firestore (datastore). Tokens last ~1h; a single cron run is well
 * within that, so we mint one per run.
 */
export async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: serviceAccount.token_uri,
    iat: now,
    exp: now + 3600,
  };

  const signingInput =
    bytesToB64url(utf8(JSON.stringify(header))) +
    '.' +
    bytesToB64url(utf8(JSON.stringify(claim)));

  const key = await importServiceAccountKey(serviceAccount.private_key);
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    utf8(signingInput),
  );
  const jwt = signingInput + '.' + bytesToB64url(new Uint8Array(sig));

  const res = await fetch(serviceAccount.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:
      'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + jwt,
  });
  if (!res.ok) {
    throw new Error('Token exchange failed: ' + res.status + ' ' + (await res.text()));
  }
  const data = await res.json();
  return data.access_token;
}

/* ------------------------------ Firestore ------------------------------ */

function baseUrl(projectId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

/**
 * Convert a Firestore REST typed value into a plain JS value (the subset this
 * app stores: strings, numbers, booleans, timestamps, maps, arrays).
 */
function decodeValue(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue; // ISO 8601 string
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  return null;
}

function decodeFields(fields) {
  const out = {};
  for (const k of Object.keys(fields)) out[k] = decodeValue(fields[k]);
  return out;
}

/**
 * Collection-group query across every user's `pushSubscriptions` subcollection.
 * Returns [{ name, uid, subscription }] where `name` is the full document path
 * (used later to delete expired subscriptions) and `subscription` is the saved
 * PushSubscription JSON.
 */
export async function listAllPushSubscriptions(projectId, token) {
  const res = await fetch(`${baseUrl(projectId)}:runQuery`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'pushSubscriptions', allDescendants: true }],
      },
    }),
  });
  if (!res.ok) {
    throw new Error('listAllPushSubscriptions failed: ' + res.status + ' ' + (await res.text()));
  }
  const rows = await res.json();
  const out = [];
  for (const row of rows) {
    if (!row.document) continue;
    const name = row.document.name; // .../users/{uid}/pushSubscriptions/{id}
    const m = name.match(/\/users\/([^/]+)\/pushSubscriptions\//);
    const uid = m ? m[1] : null;
    const fields = decodeFields(row.document.fields || {});
    // The subscription is stored as nested fields; rebuild the shape the
    // sender expects: { endpoint, keys: { p256dh, auth } }.
    const subscription = {
      endpoint: fields.endpoint,
      keys: fields.keys || {},
    };
    if (uid && subscription.endpoint && subscription.keys.p256dh) {
      out.push({ name, uid, subscription });
    }
  }
  return out;
}

/**
 * Whether the user has any report dated in the given month/year. Mirrors the
 * client-side check in notification.service. `month` is 0-based.
 */
export async function hasReportForMonth(projectId, token, uid, year, month) {
  const res = await fetch(`${baseUrl(projectId)}/users/${uid}:runQuery`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: { from: [{ collectionId: 'reports' }] },
    }),
  });
  if (!res.ok) return false; // fail open to "no report" so a reminder still goes out

  const rows = await res.json();
  for (const row of rows) {
    if (!row.document) continue;
    const fields = decodeFields(row.document.fields || {});
    const raw = fields.report_date;
    if (!raw) continue;
    const d = new Date(raw); // timestampValue ISO string, or stored string
    if (Number.isNaN(d.getTime())) continue;
    if (d.getFullYear() === year && d.getMonth() === month) return true;
  }
  return false;
}

/**
 * All Bible-study / return-visit entries for a user (the people they study
 * with), from `users/{uid}/bibleStudies`. Returns the raw fields the morning
 * reminder needs; date filtering and time formatting happen in the caller.
 * `schedule` comes back as an ISO string (Firestore Timestamp) or whatever
 * string was stored. Fails open to [] so a query error never blocks the push.
 */
export async function listBibleStudies(projectId, token, uid) {
  const res = await fetch(`${baseUrl(projectId)}/users/${uid}:runQuery`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: { from: [{ collectionId: 'bibleStudies' }] },
    }),
  });
  if (!res.ok) return [];

  const rows = await res.json();
  const out = [];
  for (const row of rows) {
    if (!row.document) continue;
    const f = decodeFields(row.document.fields || {});
    out.push({
      name: f.bible_study || '',
      type: f.type || '', // 'bs' (Bible study) or 'rv' (return visit)
      schedule: f.schedule || null,
      completed: f.completed === true,
    });
  }
  return out;
}

/**
 * Delete a subscription document by its full resource name. Called when a push
 * endpoint returns 404/410 (the browser unsubscribed or the endpoint expired).
 */
export async function deleteDocument(name, token) {
  await fetch(`https://firestore.googleapis.com/v1/${name}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}
