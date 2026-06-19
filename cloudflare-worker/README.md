# ReportEase Weather-Tip Worker

A tiny Cloudflare Worker that turns the current weather into one short ministry
preparation tip. It keeps the Gemini API key server-side so the browser never
sees it. Free tier: Cloudflare Workers (100k req/day) + Gemini Developer API
(Flash-Lite ~1,000 req/day).

## One-time setup

1. **Get a free Gemini key** at <https://aistudio.google.com/app/apikey> (no card needed).
2. **Get a free Cloudflare account** at <https://dash.cloudflare.com/sign-up>.
3. Install the CLI and log in:
   ```bash
   npm install -g wrangler
   wrangler login
   ```
4. From this folder, store the key as a secret and deploy:
   ```bash
   cd cloudflare-worker
   wrangler secret put GEMINI_API_KEY      # paste your Gemini key when prompted
   wrangler deploy
   ```
5. Copy the deployed URL (looks like `https://reportease-weather-tip.<you>.workers.dev`)
   into both `src/environments/environment.ts` and `environment.prod.ts` as
   `weatherAiUrl`.
6. **(Recommended)** Lock CORS down: set `ALLOWED_ORIGIN` in `wrangler.toml` to your
   app's exact origin (e.g. `https://reportease-app.web.app`) and redeploy.

## Test it
```bash
curl -X POST https://<your-worker-url> \
  -H "Content-Type: application/json" \
  -d '{"description":"light rain","temperature":14,"city":"London","partOfDay":"morning","scene":"rain"}'
# -> {"text":"Take an umbrella and a waterproof bag for your literature."}
```

## Notes
- If `weatherAiUrl` is empty, or the Worker/Gemini is unreachable, or the user is
  offline, the app silently falls back to its built-in rule-based tip. The feature
  is purely additive.
- The app caches each tip per day + weather condition, so it makes roughly one
  call per user per day, keeping you well inside the free tier.
- To change the model, edit `GEMINI_MODEL` in `wrangler.toml` (e.g. `gemini-2.5-flash`).
