// DEVELOPMENT Firebase configuration
// This configuration is used when running in development mode (ng serve)
// IMPORTANT: This file is automatically replaced with environment.prod.ts during production builds
// NOTE: Temporarily pointed at the PRODUCTION project (reportease-app) so dev writes
// to the live database. Switch back to staging once that project has a Firestore DB.
export const environment = {
  production: false,
  // URL of the Cloudflare Worker that proxies Gemini for weather tips.
  // Leave empty to disable AI tips (the app falls back to the rule-based tip).
  weatherAiUrl: 'https://reportease-weather-tip.reportease.workers.dev',
  // Same Worker, /chat route: app-scoped help chatbot. Empty disables the widget.
  chatAiUrl: 'https://reportease-weather-tip.reportease.workers.dev/chat',
  // Worker /route endpoint for the in-app driving route line on study maps.
  // The OpenRouteService key lives server-side as a Worker secret, so nothing
  // sensitive ships in this bundle. Empty disables the route line (the
  // straight-line distance still shows).
  routeApiUrl: 'https://reportease-weather-tip.reportease.workers.dev/route',
  // Worker /push/test endpoint — sends one push immediately to verify delivery.
  pushTestUrl: 'https://reportease-weather-tip.reportease.workers.dev/push/test',
  // VAPID public key (base64url) for Web Push subscriptions. Must match the
  // VAPID_PUBLIC_KEY var set on the Cloudflare Worker. Paste the public key
  // from `npx web-push generate-vapid-keys`. Empty disables push.
  vapidPublicKey: 'BOEQ3qlOzfcElN2jZWYanCgafn7CwNoljESAM9rD2adLKxp18QmI4QHlt6-Uj4-o33FFUJ5_LebcZ3_e1-sNDn4',
  firebase: {
    // PRODUCTION Firebase credentials (shared with environment.prod.ts)
    apiKey: 'AIzaSyAOZ6R5siNGVKJp76i8uQunU9mojsKvU64',
    authDomain: 'reportease-app.firebaseapp.com',
    projectId: 'reportease-app',
    storageBucket: 'reportease-app.firebasestorage.app',
    messagingSenderId: '540320774976',
    appId: '1:540320774976:web:6be3679164b40d903dd8a5',
    measurementId: 'G-LGQ0WPDNRV',
  },
};
