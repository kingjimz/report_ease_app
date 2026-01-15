import {
  ApplicationConfig,
  provideZoneChangeDetection,
  isDevMode,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import {
  provideFirestore,
  initializeFirestore,
  persistentLocalCache,
} from '@angular/fire/firestore';

//Firebase
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideServiceWorker } from '@angular/service-worker';

// Detect iOS devices - safe for SSR
function isIOS(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// iOS Safari has known issues with delayed service worker registration that can block page load
// Use immediate registration for iOS instead of waiting for app to be stable
const isIOSDevice = typeof window !== 'undefined' && isIOS();
const serviceWorkerConfig = isIOSDevice
  ? {
      enabled: !isDevMode(),
      registrationStrategy: 'registerImmediately' as const, // Immediate registration prevents iOS hanging
    }
  : {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000' as const,
    };

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideClientHydration(),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    // Modified: Use initializeFirestore with persistentLocalCache for offline support
    provideFirestore(() =>
      initializeFirestore(initializeApp(environment.firebase), {
        localCache: persistentLocalCache(),
      }),
    ),
    provideAuth(() => getAuth()),
    provideServiceWorker('ngsw-worker.js', serviceWorkerConfig),
  ],
};
