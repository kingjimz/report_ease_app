import {
  ApplicationConfig,
  provideZoneChangeDetection,
  isDevMode,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import {
  provideFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from '@angular/fire/firestore';

//Firebase
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideServiceWorker } from '@angular/service-worker';

// Log which environment is being used
if (!environment.production) {
  console.log('🔥 Firebase Environment: STAGING/DEVELOPMENT');
  console.log('📦 Project ID:', environment.firebase.projectId);
  console.log('🌐 Auth Domain:', environment.firebase.authDomain);
} else {
  console.log('🔥 Firebase Environment: PRODUCTION');
  console.log('📦 Project ID:', environment.firebase.projectId);
  console.log('🌐 Auth Domain:', environment.firebase.authDomain);
}

// Shared Firebase app instance (initialized lazily)
let firebaseAppInstance: ReturnType<typeof initializeApp> | null = null;

function getFirebaseApp() {
  if (!firebaseAppInstance) {
    firebaseAppInstance = initializeApp(environment.firebase);
  }
  return firebaseAppInstance;
}

// Service Worker configuration
const serviceWorkerConfig = {
  enabled: !isDevMode(),
  registrationStrategy: 'registerWhenStable:30000',
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideClientHydration(),
    provideAnimations(),
    provideFirebaseApp(() => getFirebaseApp()),
    // Use initializeFirestore with persistentLocalCache for offline support.
    // The multi-tab manager shares one durable IndexedDB cache across every tab
    // and the installed PWA window, so persistence (and the offline mutation
    // queue that replays on reconnect) stays reliably enabled instead of
    // silently falling back to in-memory in a second context.
    provideFirestore(() =>
      initializeFirestore(getFirebaseApp(), {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      }),
    ),
    provideAuth(() => getAuth()),
    provideServiceWorker('ngsw-worker.js', serviceWorkerConfig),
  ],
};
