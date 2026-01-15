import { Component, OnInit, OnDestroy } from '@angular/core';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import { Router, RouterOutlet } from '@angular/router';
import { ApiService } from './_services/api.service';
import { CommonModule } from '@angular/common';
import { PwaInstallPromptComponent } from './components/pwa-install-prompt/pwa-install-prompt.component';
import { NotificationPermissionToastComponent } from './components/notification-permission-toast/notification-permission-toast.component';
import { AppUpdateToastComponent } from './components/app-update-toast/app-update-toast.component';
import { ThemeService } from './services/theme.service';
import { NetworkService } from './_services/network.service';
import { NotificationService } from './_services/notification.service';
import { VersionService } from './_services/version.service';
import { Subscription } from 'rxjs';

@Component({
  standalone: true,
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  imports: [RouterOutlet, CommonModule, PwaInstallPromptComponent, NotificationPermissionToastComponent, AppUpdateToastComponent],
})
export class AppComponent implements OnInit, OnDestroy {
  isOnline = true;
  private networkSubscription?: Subscription;

  constructor(
    private auth: Auth,
    private router: Router,
    private api: ApiService,
    private themeService: ThemeService,
    private networkService: NetworkService,
    private notificationService: NotificationService,
    private versionService: VersionService,
  ) {}

  ngOnInit() {
    // Initialize version checking (for iOS support)
    this.initializeVersionChecking();
    
    // Subscribe to network status
    this.networkSubscription = this.networkService.onlineStatus$.subscribe(
      (isOnline) => {
        this.isOnline = isOnline;
        if (isOnline) {
          console.log('App is back online, syncing data...');
        } else {
          console.log('App is offline, using cached data');
        }
      }
    );
    this.isOnline = this.networkService.isOnline;

    // Initialize notifications
    this.initializeNotifications();

    onAuthStateChanged(this.auth, (user) => {
      if (user) {
        this.router.navigateByUrl('/');
        // Load Bible studies (will use cache if offline)
        this.loadBibleStudies();
        // Initialize notifications for logged-in user
        this.initializeNotificationsForUser();
      } else {
        // Only redirect to login if online (offline users should stay on current page)
        if (this.networkService.isOnline) {
          this.router.navigateByUrl('/login');
        }
      }
    });
  }

  /**
   * Initialize version checking for iOS devices
   */
  private initializeVersionChecking() {
    // Detect iOS
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    
    if (isIOS) {
      // Set current version (you can update this during build or from package.json)
      const currentVersion = this.getAppVersion();
      this.versionService.setCurrentVersion(currentVersion);
      
      // Initialize version checking for iOS
      this.versionService.initializeVersionChecking();
      console.log('iOS version checking initialized. Current version:', currentVersion);
    }
  }

  /**
   * Get app version (can be set during build or from environment)
   */
  private getAppVersion(): string {
    // Try to get from meta tag or environment
    const metaVersion = document.querySelector('meta[name="app-version"]')?.getAttribute('content');
    if (metaVersion) {
      return metaVersion;
    }
    
    // Default version - should be updated during build
    return '1.0.0';
  }

  /**
   * Initialize notification system
   */
  private initializeNotifications() {
    // Handle service worker notification clicks if using service worker notifications
    if ('serviceWorker' in navigator) {
      // iOS compatibility: Add timeout to prevent blocking
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const timeout = isIOS ? 10000 : 5000; // Longer timeout for iOS
      
      // Try to register notification service worker for handling notification clicks
      // This will only work if Angular's service worker doesn't conflict
      const registrationPromise = navigator.serviceWorker.getRegistration();
      const timeoutPromise = new Promise((resolve) => 
        setTimeout(() => resolve(null), timeout)
      );
      
      Promise.race([registrationPromise, timeoutPromise])
        .then((registration: any) => {
          if (registration) {
            // Angular's service worker is registered, we'll use it for notifications
            console.log('Using Angular service worker for notifications');
          } else if (!isIOS) {
            // No service worker registered, register our notification SW (skip on iOS to avoid conflicts)
            navigator.serviceWorker.register('/notification-sw.js').catch((error) => {
              console.log('Notification service worker registration failed:', error);
            });
          }
        })
        .catch((error) => {
          console.warn('Service worker check failed (non-blocking):', error);
        });

      // Listen for service worker messages (for future use)
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'NOTIFICATION_CLICK') {
          const action = event.data.action;
          if (action === 'open' || !action) {
            this.router.navigate(['/reports']);
            window.focus();
          }
        }
      });
    }
  }

  /**
   * Initialize notifications for logged-in user
   */
  private async initializeNotificationsForUser() {
    // Check if notifications are enabled and permission is granted
    if (this.notificationService.isNotificationEnabled()) {
      // Permission might have been granted, check status
      const permission = await this.notificationService.requestPermission();
      if (permission) {
        // Start checking for reports
        setTimeout(() => {
          this.notificationService.manualCheck();
        }, 5000); // Wait 5 seconds for data to load
      }
    }
  }

  ngOnDestroy() {
    if (this.networkSubscription) {
      this.networkSubscription.unsubscribe();
    }
  }

  async loadBibleStudies() {
    await this.api
      .getBibleStudies()
      .then((data) => {})
      .catch((error) => {
        console.error('Error fetching Bible studies:', error);
      });
  }
}
