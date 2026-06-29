/**
 * AI proxy for ReportEase, running on Cloudflare Workers AI (no external API
 * key). Two endpoints, routed by path:
 *
 *   POST /            -> weather "before you head out" tip
 *   POST /chat        -> app-scoped help chatbot (answers only about the app)
 *   POST /route       -> driving route to a study pin (proxies OpenRouteService)
 *
 * Bindings / vars (see wrangler.toml):
 *   AI              (binding) - Workers AI; runs the model on Cloudflare
 *   ALLOWED_ORIGIN  (var)     - exact origin allowed via CORS. Defaults to "*".
 *   AI_MODEL        (var)     - text model id. Defaults to Llama 3.1 8B Instruct.
 *   ORS_API_KEY     (secret)  - OpenRouteService key, kept server-side so it is
 *                               never shipped to the browser. Set with:
 *                               wrangler secret put ORS_API_KEY
 */

const FALLBACK_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400, cors);
    }

    const path = new URL(request.url).pathname;
    if (path.endsWith('/route')) return handleRoute(body, env, cors);
    return path.endsWith('/chat')
      ? handleChat(body, env, cors)
      : handleTip(body, env, cors);
  },
};

/* ------------------------------ Routing -------------------------------- */

/**
 * Proxy a driving-route request to OpenRouteService using the server-side
 * ORS_API_KEY secret, and return a slimmed result the client can draw directly.
 * Body: { from: {lat,lng}, to: {lat,lng} }.
 */
async function handleRoute(body, env, cors) {
  const from = body.from;
  const to = body.to;
  if (
    !env.ORS_API_KEY ||
    !isCoord(from) ||
    !isCoord(to)
  ) {
    return json({ error: 'Missing key or coordinates' }, 400, cors);
  }

  try {
    const url =
      `https://api.openrouteservice.org/v2/directions/driving-car` +
      `?api_key=${env.ORS_API_KEY}` +
      `&start=${from.lng},${from.lat}&end=${to.lng},${to.lat}`;
    const res = await fetch(url);
    if (!res.ok) return json({ error: 'Route lookup failed' }, 502, cors);

    const data = await res.json();
    const feature = data?.features?.[0];
    const coords = feature?.geometry?.coordinates || [];
    const summary = feature?.properties?.summary;
    if (!coords.length || !summary) {
      return json({ error: 'No route found' }, 502, cors);
    }

    // Flatten the per-segment turn-by-turn steps for in-app guidance.
    // way_points[0] indexes into the geometry coordinates (the maneuver point).
    const segments = feature?.properties?.segments || [];
    const steps = [];
    for (const seg of segments) {
      for (const st of seg.steps || []) {
        steps.push({
          instruction: String(st.instruction || ''),
          name: String(st.name || ''),
          distanceM: Number(st.distance) || 0,
          type: Number.isFinite(st.type) ? st.type : null,
          wayPoint: Array.isArray(st.way_points) ? st.way_points[0] : 0,
        });
      }
    }

    return json(
      {
        // ORS gives [lon, lat]; hand the client {lat, lng}.
        path: coords.map((c) => ({ lat: c[1], lng: c[0] })),
        distanceKm: summary.distance / 1000,
        durationMin: summary.duration / 60,
        steps,
      },
      200,
      cors,
    );
  } catch (err) {
    return json({ error: 'Route lookup failed', detail: String(err) }, 502, cors);
  }
}

function isCoord(c) {
  return c && Number.isFinite(c.lat) && Number.isFinite(c.lng);
}

/* ----------------------------- Weather tip ----------------------------- */

async function handleTip(body, env, cors) {
  // Sanitize inputs (defensive: keep the prompt small and well-formed).
  const scene = String(body.scene || 'clear-day').slice(0, 20);
  const description = String(body.description || 'clear').slice(0, 40);
  const city = String(body.city || 'your area').slice(0, 60);
  const partOfDay = String(body.partOfDay || 'day').slice(0, 12);
  const temperature = Number.isFinite(body.temperature)
    ? Math.round(body.temperature)
    : null;
  const forecastText = String(body.forecastText || '').slice(0, 300);
  const ministry = body.ministry || null;

  // Field ministry happens in the morning and afternoon. In the evening and
  // overnight, drop all ministry wording and give a plain "if you head out" tip.
  const isMinistryTime = partOfDay === 'morning' || partOfDay === 'afternoon';

  // Build ministry instruction block when data is available during ministry hours.
  const ministryInstruction =
    isMinistryTime && ministry
      ? `You also have ministry context listing only studies near the user. ` +
        `When rain, heavy rain, or a thunderstorm is expected: ` +
        `(1) if a nearby study's barangay is clear, recommend conducting that ` +
        `study in person there, naming the person and barangay specifically; ` +
        `(2) if the study's area or all nearby areas are rainy or stormy, do not ` +
        `tell them to skip it. Instead suggest the best way to still conduct it, ` +
        `such as calling the person by phone or holding the bible study online ` +
        `over a video call, naming the person; you may also suggest letter ` +
        `writing as an option. Only suggest a study that appears ` +
        `in the ministry data; if none are listed, give standard weather and ` +
        `safety advice and do not invent a person or place. `
      : '';

  const system =
    (isMinistryTime
      ? `You are a helpful assistant for a Jehovah's Witness using a field-ministry app. ` +
        `Write a short, warm, practical message (max 50 words) for ministry ` +
        `over the next few hours. ` + ministryInstruction
      : `You are a helpful weather assistant. It is ${partOfDay}, outside of normal ` +
        `field-ministry hours, so do NOT mention ministry, preaching, field service, ` +
        `or going door to door. Write a short, warm, practical message (max 50 words) ` +
        `for someone who might head out over the next few hours. `) +
    `The forecast lists only upcoming hours. If it shows a notable change (rain, ` +
    `storms, clearing), begin with ONE sentence naming what to expect and the soonest ` +
    `specific time it is likely, e.g. "Rain is likely around 7 PM." Then add ONE ` +
    `sentence advising what to wear or bring or where to go. If nothing notable is ` +
    `ahead, give just the single advice sentence. Use the forecast times exactly as ` +
    `given, and never mention a time earlier than the forecast. Plain text only: no ` +
    `emoji, no quotes, no markdown, at most three sentences.`;

  // Build ministry data line for the user message.
  let ministryLine = '';
  if (isMinistryTime && ministry) {
    const matches = Array.isArray(ministry.studyMatches) ? ministry.studyMatches : [];
    const clearStudies = matches
      .filter((m) => !m.isRainy)
      .map((m) => `${m.studyName} in ${m.barangayName}`)
      .join(', ');
    const rainyStudies = matches
      .filter((m) => m.isRainy)
      .map((m) => `${m.studyName} in ${m.barangayName}`)
      .join(', ');
    ministryLine =
      `\nMinistry: User location rainy: ${!!ministry.userLocationRainy}. ` +
      `Studies near clear areas: ${clearStudies || 'none'}. ` +
      `Studies near rainy areas: ${rainyStudies || 'none'}.`;
  }

  const user =
    `Conditions now: ${description}, ${temperature ?? 'unknown'} degrees Celsius, ` +
    `${partOfDay}, in ${city} (scene: ${scene}).` +
    (forecastText ? `\n${forecastText}` : '') +
    ministryLine;

  return runModel(
    env,
    cors,
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { temperature: 0.7, max_tokens: 160 },
  );
}

/* ------------------------------- Chatbot ------------------------------- */

// The chatbot answers ONLY questions about using the ReportEase app. The whole
// feature inventory lives here so answers stay grounded and never invented.
const CHAT_SYSTEM_PROMPT =
  `You are "ServiceMate", the in-app assistant for "Field Service Tracker" (also called ` +
  `ReportEase), a mobile app that helps Jehovah's Witnesses track their field ` +
  `ministry. Answer ONLY questions about how to use this app and what it can do. ` +
  `\n\nWhat the app offers:\n` +
  `- Account: sign in or register. On first launch an onboarding screen asks ` +
  `whether you are a pioneer or a publisher, which controls whether hours appear ` +
  `on your reports. An interactive tutorial walks new users through the main ` +
  `features right after onboarding.\n` +
  `- Dashboard: a weather widget (local conditions, an AI "before you head out" ` +
  `tip, and a swipeable 7-day forecast) and a Daily Practice card that walks ` +
  `through Sermon-on-the-Mount verses with checklist steps and tracks your streak.\n` +
  `- Calendar: month or week view; tap a date to view or add that day's report.\n` +
  `- Reports page: at the top are clickable stat tiles (Total Reports, Active ` +
  `Bible Studies, Return Visits, Completed) that jump straight to the matching ` +
  `section. Each monthly report card shows hours, ministry participation, and a ` +
  `progress bar. You can download a report as a formatted PNG image or share it ` +
  `directly using the Share button (uses the device share sheet on supported ` +
  `phones, or copies the image to your clipboard). Use the "Show All / Show ` +
  `Less" toggle to expand or collapse the list, and pagination controls let you ` +
  `browse when you have many reports.\n` +
  `- Adding reports: tap the + button in the bottom tab bar. A picker lets you ` +
  `choose between a Daily Report (log a single day with date, hours, minutes, ` +
  `ministry participation, and optional notes) or a Monthly Report (enter ` +
  `totals for an entire month and generate a downloadable PNG). You can also ` +
  `add a daily report from the Calendar by tapping a date, or from the ` +
  `Dashboard.\n` +
  `- Bible studies and return visits: add, edit, or delete the people you study ` +
  `with. Each entry includes a name, type (Bible Study or Return Visit), a ` +
  `next-schedule date and time, and a next-lesson field you can copy to the ` +
  `clipboard. You can search studies by name, address, or schedule using the ` +
  `search bar, and filter the list by type (All, Studies, or Return Visits). ` +
  `Use "Show All / Show Less" when you have more than two entries.\n` +
  `- Location pinning: when adding or editing a study you can drop a pin on a ` +
  `map to save the location. The details view shows the saved pin on a ` +
  `read-only map with a distance label ("X km away" from your current ` +
  `position). Tap "Change pin" to re-pin, or "Add a pin" if none is saved ` +
  `yet. The app can also show driving directions to the pinned location with ` +
  `turn-by-turn steps.\n` +
  `- Study status: each study card has a "Mark as completed" button. Completed ` +
  `studies stay in your records but are excluded from the active counts. If a ` +
  `study's scheduled date has passed without being updated, a red overdue ` +
  `indicator appears on its card.\n` +
  `- Goals: create, edit, and delete personal goals and track your progress.\n` +
  `- Notifications: turn reminders on or off for report deadlines and missed ` +
  `studies.\n` +
  `- Settings (the gear in the header): dark mode/theme, pioneer status, the ` +
  `location/weather toggle, checking for app updates, and signing out.\n` +
  `- Works offline and syncs automatically when you are back online.\n` +
  `- Can be installed to your phone or desktop as an app (PWA).\n\n` +
  `You may also be given the signed-in user's own data (their report totals, ` +
  `Bible studies, return visits, and goals). When it is provided, use it as the ` +
  `source of truth to answer personal questions like "who is my study today", ` +
  `"how many hours did I record last month", or "what are my goals". Answer ` +
  `naturally from that data; do not mention that you were handed a data summary. ` +
  `If the answer is not in the provided data, say you don't see it in their ` +
  `records rather than guessing.\n\n` +
  `Rules:\n` +
  `- Keep answers short, friendly, and practical, with simple steps when helpful.\n` +
  `- If asked anything NOT about this app or the user's own app data (general ` +
  `knowledge, math, coding, medical, doctrinal or scriptural interpretation, ` +
  `current events), do not answer it. Politely say you can only help with using ` +
  `the Field Service Tracker app and suggest an app-related question instead.\n` +
  `- Never invent features, numbers, studies, or settings. If unsure, say so.\n` +
  `- Plain text only: no markdown headings or tables.`;

async function handleChat(body, env, cors) {
  const raw = Array.isArray(body.messages) ? body.messages : [];

  // Keep the last 10 turns, drop empties, cap each message length.
  const turns = raw
    .slice(-10)
    .map((m) => ({
      role: m && m.role === 'assistant' ? 'assistant' : 'user',
      content: String((m && m.content) || '').trim().slice(0, 1000),
    }))
    .filter((m) => m.content);

  if (!turns.length) {
    return json({ error: 'No message' }, 400, cors);
  }

  // Optional snapshot of the user's own data, compiled client-side.
  const context = String(body.context || '').slice(0, 4000);
  const system = context
    ? `${CHAT_SYSTEM_PROMPT}\n\n--- THE USER'S CURRENT DATA ---\n${context}`
    : CHAT_SYSTEM_PROMPT;

  return runModel(
    env,
    cors,
    [{ role: 'system', content: system }, ...turns],
    { temperature: 0.3, max_tokens: 400 },
  );
}

/* ------------------------------- Shared -------------------------------- */

async function runModel(env, cors, messages, opts) {
  const model = env.AI_MODEL || FALLBACK_MODEL;

  try {
    const result = await env.AI.run(model, { messages, ...opts });
    const text = String(result?.response || '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!text) return json({ error: 'Empty response' }, 502, cors);
    return json({ text }, 200, cors);
  } catch (err) {
    // Workers AI throws code 7505 when rate limited; surface that distinctly so
    // the client can show a friendly "busy, try again shortly".
    const msg = String(err);
    if (msg.includes('7505') || /rate.?limit/i.test(msg)) {
      return json({ error: 'Rate limited' }, 429, cors);
    }
    return json({ error: 'Request failed', detail: msg }, 502, cors);
  }
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}
