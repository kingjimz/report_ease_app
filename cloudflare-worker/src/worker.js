/**
 * AI proxy for ReportEase, running on Cloudflare Workers AI (no external API
 * key). Two endpoints, routed by path:
 *
 *   POST /            -> weather "before you head out" tip
 *   POST /chat        -> app-scoped help chatbot (answers only about the app)
 *
 * Bindings / vars (see wrangler.toml):
 *   AI              (binding) - Workers AI; runs the model on Cloudflare
 *   ALLOWED_ORIGIN  (var)     - exact origin allowed via CORS. Defaults to "*".
 *   AI_MODEL        (var)     - text model id. Defaults to Llama 3.1 8B Instruct.
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
    return path.endsWith('/chat')
      ? handleChat(body, env, cors)
      : handleTip(body, env, cors);
  },
};

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

  // Field ministry happens in the morning and afternoon. In the evening and
  // overnight, drop all ministry wording and give a plain "if you head out" tip.
  const isMinistryTime = partOfDay === 'morning' || partOfDay === 'afternoon';

  const system =
    (isMinistryTime
      ? `You are a helpful assistant for a Jehovah's Witness using a field-ministry app. ` +
        `Write a short, warm, practical message (max 30 words) for door-to-door ministry ` +
        `over the next few hours. `
      : `You are a helpful weather assistant. It is ${partOfDay}, outside of normal ` +
        `field-ministry hours, so do NOT mention ministry, preaching, field service, ` +
        `or going door to door. Write a short, warm, practical message (max 30 words) ` +
        `for someone who might head out over the next few hours. `) +
    `The forecast lists only upcoming hours. If it shows a notable change (rain, ` +
    `storms, clearing), begin with ONE sentence naming what to expect and the soonest ` +
    `specific time it is likely, e.g. "Rain is likely around 7 PM." Then add ONE ` +
    `sentence advising what to wear or bring if you head out. If nothing notable is ` +
    `ahead, give just the single advice sentence. Use the forecast times exactly as ` +
    `given, and never mention a time earlier than the forecast. Plain text only: no ` +
    `emoji, no quotes, no markdown, at most two sentences.`;

  const user =
    `Conditions now: ${description}, ${temperature ?? 'unknown'} degrees Celsius, ` +
    `${partOfDay}, in ${city} (scene: ${scene}).` +
    (forecastText ? `\n${forecastText}` : '');

  return runModel(
    env,
    cors,
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { temperature: 0.7, max_tokens: 120 },
  );
}

/* ------------------------------- Chatbot ------------------------------- */

// The chatbot answers ONLY questions about using the ReportEase app. The whole
// feature inventory lives here so answers stay grounded and never invented.
const CHAT_SYSTEM_PROMPT =
  `You are the in-app help assistant for "Field Service Tracker" (also called ` +
  `ReportEase), a mobile app that helps Jehovah's Witnesses track their field ` +
  `ministry. Answer ONLY questions about how to use this app and what it can do. ` +
  `\n\nWhat the app offers:\n` +
  `- Account: sign in or register; on first run you choose whether you are a pioneer.\n` +
  `- Dashboard: a weather widget (local conditions, an AI "before you head out" tip, ` +
  `and a swipeable 7-day forecast) and a Daily Practice card that walks through ` +
  `Sermon-on-the-Mount verses with checklist steps and tracks your streak.\n` +
  `- Calendar: month or week view; tap a date to view or add that day's report.\n` +
  `- Reports: your activity history and totals (reports submitted, active Bible ` +
  `studies, return visits, completed studies); each report shows hours, placements, ` +
  `and participation, and can be generated and downloaded as a PNG image.\n` +
  `- Bible studies: add, edit, or delete the people you study with, including their ` +
  `schedule, address, and study type.\n` +
  `- Goals: create, edit, and delete personal goals and track your progress.\n` +
  `- Notifications: turn reminders on or off for report deadlines and missed studies.\n` +
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
