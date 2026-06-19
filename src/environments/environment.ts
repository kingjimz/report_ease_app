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
