/**
 * Weather-tip proxy for ReportEase.
 *
 * Holds the Gemini API key server-side (as a Worker secret) and turns the
 * current weather into one short, practical "before you head out" tip for
 * door-to-door ministry. The browser never sees the key.
 *
 * Secrets / vars (set with `wrangler secret put` or in the dashboard):
 *   GEMINI_API_KEY  (required) - your free Gemini Developer API key
 *   ALLOWED_ORIGIN  (optional) - exact origin allowed via CORS, e.g.
 *                                https://reportease-app.web.app. Defaults to "*".
 *   GEMINI_MODEL    (optional) - defaults to gemini-2.5-flash-lite (1000 req/day free)
 */

const FALLBACK_MODEL = 'gemini-2.5-flash-lite';

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
    if (!env.GEMINI_API_KEY) {
      return json({ error: 'Server not configured' }, 500, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400, cors);
    }

    // Sanitize inputs (defensive: keep the prompt small and well-formed).
    const scene = String(body.scene || 'clear-day').slice(0, 20);
    const description = String(body.description || 'clear').slice(0, 40);
    const city = String(body.city || 'your area').slice(0, 60);
    const partOfDay = String(body.partOfDay || 'day').slice(0, 12);
    const temperature = Number.isFinite(body.temperature)
      ? Math.round(body.temperature)
      : null;

    const prompt =
      `You are a helpful assistant for a Jehovah's Witness using a field-ministry app. ` +
      `Write ONE short, warm, practical tip (max 18 words) advising what to wear or ` +
      `bring before going outside for door-to-door ministry, based on this weather. ` +
      `Plain text only: no emoji, no quotes, no markdown, one sentence.\n` +
      `Conditions: ${description}, ${temperature ?? 'unknown'} degrees Celsius, ` +
      `${partOfDay}, in ${city} (scene: ${scene}).`;

    const model = env.GEMINI_MODEL || FALLBACK_MODEL;
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${model}:generateContent`;

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 60,
            topP: 0.9,
          },
        }),
      });

      if (!resp.ok) {
        const detail = await resp.text();
        return json({ error: 'Upstream error', detail }, 502, cors);
      }

      const data = await resp.json();
      const text = (
        data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      )
        .replace(/\s+/g, ' ')
        .trim();

      if (!text) return json({ error: 'Empty response' }, 502, cors);
      return json({ text }, 200, cors);
    } catch (err) {
      return json({ error: 'Request failed', detail: String(err) }, 502, cors);
    }
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}
