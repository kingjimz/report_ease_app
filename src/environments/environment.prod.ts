// PRODUCTION Firebase configuration
// This configuration is used when building for production (ng build --configuration=production)
// This file replaces environment.ts during production builds (configured in angular.json)
export const environment = {
  production: true,
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
  firebase: {
    // PRODUCTION Firebase credentials
    apiKey: 'AIzaSyAOZ6R5siNGVKJp76i8uQunU9mojsKvU64',
    authDomain: 'reportease-app.firebaseapp.com',
    projectId: 'reportease-app',
    storageBucket: 'reportease-app.firebasestorage.app',
    messagingSenderId: '540320774976',
    appId: '1:540320774976:web:6be3679164b40d903dd8a5',
    measurementId: 'G-LGQ0WPDNRV',
  },
};
