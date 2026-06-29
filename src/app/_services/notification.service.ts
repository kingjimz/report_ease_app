import { Injectable } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiService } from './api.service';

export interface NotificationPermission {
  granted: boolean;
  denied: boolean;
  default: boolean;
}

/**
 * Manages real Web Push notifications. Unlike the old timer-based approach
 * (which only ran while the app was open), this registers a push subscription
 * with the browser's push service and stores it in Firestore. The Cloudflare
 * Worker then pushes reminders on a daily cron, so they arrive even when the
 * app is fully closed — on Android, desktop browsers, and installed iOS PWAs
 * (iOS 16.4+).
 */
@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private permissionSubject = new BehaviorSubject<NotificationPermission>({
    granted: false,
    denied: false,
    default: false,
  });
  public permission$ = this.permissionSubject.asObservable();

  private readonly NOTIFICATION_KEY = 'report_notification_enabled';
  private readonly NOTIFICATION_TIME_KEY = 'notification_time';

  constructor(
    private apiService: ApiService,
    private swPush: SwPush,
  ) {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      this.checkPermissionStatus();
      // If push was already enabled, make sure a live subscription exists
      // (browsers can rotate or drop endpoints).
      if (Notification.permission === 'granted' && this.isNotificationEnabled()) {
        this.subscribeToPush();
      }
    } else {
      console.warn('Notification API not available in this browser/environment');
    }
  }

  /** Reflect the current browser permission into permission$. */
  private checkPermissionStatus() {
    if (!('Notification' in window)) return;
    const permission = Notification.permission;
    this.permissionSubject.next({
      granted: permission === 'granted',
      denied: permission === 'denied',
      default: permission === 'default',
    });
  }

  /**
   * Request permission from the user, then register a push subscription.
   * Returns true once notifications are granted and a subscription is stored.
   */
  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'denied') {
      this.checkPermissionStatus();
      return false;
    }

    try {
      const permission =
        Notification.permission === 'granted'
          ? 'granted'
          : await Notification.requestPermission();
      this.checkPermissionStatus();

      if (permission === 'granted') {
        await this.enableNotifications();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }

  /** Mark notifications enabled and subscribe to push. */
  async enableNotifications(): Promise<void> {
    localStorage.setItem(this.NOTIFICATION_KEY, 'true');
    await this.subscribeToPush();
  }

  /** Mark notifications disabled and tear down the push subscription. */
  async disableNotifications(): Promise<void> {
    localStorage.setItem(this.NOTIFICATION_KEY, 'false');
    await this.unsubscribeFromPush();
  }

  isNotificationEnabled(): boolean {
    return localStorage.getItem(this.NOTIFICATION_KEY) === 'true';
  }

  /**
   * Subscribe to Web Push and persist the subscription for the Worker to use.
   * No-op (with a console note) when the service worker is inactive — e.g. in
   * `ng serve` dev mode, where Angular disables ngsw — or when no VAPID key is
   * configured.
   */
  private async subscribeToPush(): Promise<PushSubscription | null> {
    if (!this.swPush.isEnabled) {
      console.warn('Push not available: service worker is not enabled (dev mode?).');
      return null;
    }
    if (!environment.vapidPublicKey) {
      console.warn('Push not configured: environment.vapidPublicKey is empty.');
      return null;
    }

    try {
      // Reuse an existing subscription if the browser already has one.
      const reg = await navigator.serviceWorker.getRegistration();
      const existing = await reg?.pushManager.getSubscription();
      const sub =
        existing ??
        (await this.swPush.requestSubscription({
          serverPublicKey: environment.vapidPublicKey,
        }));

      await this.apiService.savePushSubscription(sub);
      return sub;
    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error);
      return null;
    }
  }

  private async unsubscribeFromPush(): Promise<void> {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await this.apiService.deletePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
    } catch (error) {
      console.error('Failed to unsubscribe from push:', error);
    }
  }

  /**
   * Ensure a valid subscription is on file for an already-enabled user. Called
   * after login once the service worker is ready.
   */
  async manualCheck(): Promise<void> {
    if (
      'Notification' in window &&
      Notification.permission === 'granted' &&
      this.isNotificationEnabled()
    ) {
      await this.subscribeToPush();
    }
  }

  /**
   * Send a real push end-to-end through the Cloudflare Worker so the user can
   * confirm delivery (it arrives via the push service, exactly like the daily
   * reminder). Falls back to a local notification when push is unavailable
   * (e.g. dev mode) so testing still shows something.
   */
  async sendTestNotification(): Promise<void> {
    if (!('Notification' in window)) {
      throw new Error('This browser does not support notifications');
    }
    if (Notification.permission !== 'granted') {
      throw new Error('Notification permission not granted: ' + Notification.permission);
    }

    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();

    if (sub && environment.pushTestUrl) {
      const res = await fetch(environment.pushTestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (res.ok) return;
      console.warn('Worker push test failed, falling back to local notification.');
    }

    // Local fallback (dev mode or no subscription yet).
    if (reg) {
      await reg.showNotification('📋 Test Notification', {
        body: 'Local test notification. Real push needs the deployed service worker.',
        icon: '/assets/icons/fst-icon-192x192.png',
        badge: '/assets/icons/fst-icon-192x192.png',
        tag: 'test-notification',
      });
    } else {
      new Notification('📋 Test Notification', {
        body: 'Local test notification.',
      });
    }
  }

  setNotificationTime(hour: number, minute: number = 0) {
    localStorage.setItem(this.NOTIFICATION_TIME_KEY, JSON.stringify({ hour, minute }));
  }

  getNotificationTime(): { hour: number; minute: number } {
    const stored = localStorage.getItem(this.NOTIFICATION_TIME_KEY);
    if (stored) return JSON.parse(stored);
    return { hour: 6, minute: 0 };
  }
}
