import { Component, OnInit, OnDestroy } from '@angular/core';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import { SwPush } from '@angular/service-worker';
import { Router, RouterOutlet } from '@angular/router';
import { ApiService } from './_services/api.service';
import { CommonModule } from '@angular/common';
import { PwaInstallPromptComponent } from './components/pwa-install-prompt/pwa-install-prompt.component';
import { NotificationPermissionToastComponent } from './components/notification-permission-toast/notification-permission-toast.component';
import { AppUpdateToastComponent } from './components/app-update-toast/app-update-toast.component';
import { ChatbotWidgetComponent } from './components/chatbot-widget/chatbot-widget.component';
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
  imports: [RouterOutlet, CommonModule, PwaInstallPromptComponent, NotificationPermissionToastComponent, AppUpdateToastComponent, ChatbotWidgetComponent],
})
export class AppComponent implements OnInit, OnDestroy {
  isOnline = true;
  /** Gates the help chatbot — hidden on login/register (no signed-in user). */
  loggedIn = false;
  private networkSubscription?: Subscription;

  constructor(
    private auth: Auth,
    private swPush: SwPush,
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
      this.loggedIn = !!user;
      // Don't redirect if user is on the install page
      const currentUrl = this.router.url;
      if (currentUrl === '/install') {
        // Still load data if user is logged in, but don't redirect
        if (user) {
          this.loadBibleStudies();
          this.initializeNotificationsForUser();
        }
        return;
      }

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
  private async initializeVersionChecking() {
    // Fetch version from version.json first
    await this.loadVersionFromFile();
    
    // Detect iOS
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    
    if (isIOS) {
      // Initialize version checking for iOS
      this.versionService.initializeVersionChecking();
      const currentVersion = this.versionService.getCurrentAppVersion();
      console.log('iOS version checking initialized. Current version:', currentVersion);
    }
  }

  /**
   * Load version from version.json file
   */
  private async loadVersionFromFile(): Promise<void> {
    try {
      const response = await fetch('/version.json?t=' + Date.now(), {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        const version = data.version || data.appVersion || '1.0.0';
        this.versionService.setCurrentVersion(version);
        console.log('Version loaded from version.json:', version);
      } else {
        // Fallback to default if fetch fails
        console.warn('Failed to load version.json, using default');
        this.versionService.setCurrentVersion('1.0.0');
      }
    } catch (error) {
      console.error('Error loading version from version.json:', error);
      // Fallback to default if fetch fails
      this.versionService.setCurrentVersion('1.0.0');
    }
  }

  /**
   * Wire push notification taps. Angular's service worker (ngsw) handles the
   * `push` and `notificationclick` events natively, and surfaces taps through
   * SwPush.notificationClicks. The reminder payload carries an /reports target,
   * so route there on tap.
   */
  private initializeNotifications() {
    if (!this.swPush.isEnabled) {
      return; // dev mode or unsupported browser
    }
    this.swPush.notificationClicks.subscribe(({ notification }) => {
      const url = notification?.data?.onActionClick?.default?.url || '/reports';
      this.router.navigateByUrl(url);
    });
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
