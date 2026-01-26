import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { enableProdMode } from '@angular/core';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

// Enhanced error handling for iOS compatibility
bootstrapApplication(AppComponent, appConfig).catch((err) => {
  console.error('Angular bootstrap error:', err);
  
  // On iOS, show a user-friendly error message if bootstrap fails
  if (typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    const appRoot = document.querySelector('app-root');
    if (appRoot) {
      appRoot.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background-color: #ffffff; color: #111827; font-family: 'Poppins', sans-serif; padding: 20px;">
          <div style="text-align: center; max-width: 500px;">
            <h1 style="font-size: 24px; margin-bottom: 16px; color: #ef4444;">Application Error</h1>
            <p style="font-size: 16px; margin-bottom: 16px; color: #6b7280;">The application failed to load. Please try refreshing the page.</p>
            <button onclick="window.location.reload()" style="background-color: #3b82f6; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 16px; cursor: pointer; font-family: 'Poppins', sans-serif;">
              Reload Page
            </button>
            <details style="margin-top: 20px; text-align: left;">
              <summary style="cursor: pointer; color: #6b7280; font-size: 14px;">Error Details</summary>
              <pre style="background-color: #f3f4f6; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 12px; margin-top: 8px;">${err.message || err}</pre>
            </details>
          </div>
        </div>
      `;
    }
  }
  
  // Re-throw to ensure it's logged
  throw err;
});
