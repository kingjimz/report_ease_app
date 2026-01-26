import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { BehaviorSubject, Observable } from 'rxjs';

export interface NotificationPermission {
  granted: boolean;
  denied: boolean;
  default: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private permissionSubject = new BehaviorSubject<NotificationPermission>({
    granted: false,
    denied: false,
    default: false
  });
  public permission$ = this.permissionSubject.asObservable();

  private notificationCheckInterval: any = null;
  private readonly NOTIFICATION_KEY = 'report_notification_enabled';
  private readonly LAST_CHECK_KEY = 'last_notification_check';
  private readonly LAST_DAILY_MINISTRY_REMINDER_KEY = 'last_daily_ministry_reminder';
  private readonly NOTIFICATION_TIME_KEY = 'notification_time';

  constructor(private apiService: ApiService) {
    // Only initialize if Notification API is available (not available on all iOS versions)
    if (typeof window !== 'undefined' && 'Notification' in window) {
      this.checkPermissionStatus();
      this.initializeNotifications();
    } else {
      console.warn('Notification API not available in this browser/environment');
    }
  }

  /**
   * Check current notification permission status
   */
  private checkPermissionStatus() {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return;
    }

    const permission = Notification.permission;
    this.permissionSubject.next({
      granted: permission === 'granted',
      denied: permission === 'denied',
      default: permission === 'default'
    });
  }

  /**
   * Request notification permission from user
   */
  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      this.checkPermissionStatus();
      return true;
    }

    if (Notification.permission === 'denied') {
      console.warn('Notification permission was previously denied');
      this.checkPermissionStatus();
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      this.checkPermissionStatus();
      
      if (permission === 'granted') {
        this.enableNotifications();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }

  /**
   * Enable notifications and start checking for report submissions
   */
  enableNotifications() {
    localStorage.setItem(this.NOTIFICATION_KEY, 'true');
    this.scheduleNotificationCheck();
  }

  /**
   * Disable notifications
   */
  disableNotifications() {
    localStorage.setItem(this.NOTIFICATION_KEY, 'false');
    this.clearNotificationCheck();
  }

  /**
   * Check if notifications are enabled
   */
  isNotificationEnabled(): boolean {
    return localStorage.getItem(this.NOTIFICATION_KEY) === 'true';
  }

  /**
   * Initialize notifications if permission is granted
   */
  private initializeNotifications() {
    // Check if Notification API is available before accessing it
    if (!('Notification' in window)) {
      return;
    }
    
    if (Notification.permission === 'granted' && this.isNotificationEnabled()) {
      this.scheduleNotificationCheck();
    }
  }

  /**
   * Schedule periodic checks for notifications
   */
  private scheduleNotificationCheck() {
    // Clear any existing interval
    this.clearNotificationCheck();

    // Check immediately on first run
    this.checkAndNotify();

    // Schedule to check once per day at 6 AM
    const now = new Date();
    const nextCheck = new Date();
    nextCheck.setHours(6, 0, 0, 0); // 6 AM
    nextCheck.setMinutes(0);
    nextCheck.setSeconds(0);
    nextCheck.setMilliseconds(0);
    
    // If it's already past 6 AM today, schedule for tomorrow
    if (nextCheck <= now) {
      nextCheck.setDate(nextCheck.getDate() + 1);
    }
    
    const msUntilNextCheck = nextCheck.getTime() - now.getTime();
    console.log(`Scheduling daily notification check in ${Math.round(msUntilNextCheck / 1000 / 60)} minutes`);

    // Set initial timeout for first check
    setTimeout(() => {
      this.checkAndNotify();
      // Then check once per day at 6 AM
      this.notificationCheckInterval = setInterval(() => {
        this.checkAndNotify();
      }, 24 * 60 * 60 * 1000); // 24 hours
    }, msUntilNextCheck);
  }

  /**
   * Clear notification check interval
   */
  private clearNotificationCheck() {
    if (this.notificationCheckInterval) {
      clearInterval(this.notificationCheckInterval);
      this.notificationCheckInterval = null;
    }
  }

  /**
   * Check and send appropriate notifications
   */
  async checkAndNotify() {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    if (!this.isNotificationEnabled()) {
      return;
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Only send notifications at or after 6 AM
    if (currentHour < 6) {
      console.log('Too early for notifications. Waiting until 6 AM.');
      return;
    }

    try {
      const hasReport = await this.checkCurrentMonthReport();
      const dayOfMonth = now.getDate();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const daysRemaining = daysInMonth - dayOfMonth;
      
      // Check if we're in the last 3 days of the month
      const isLast3Days = daysRemaining <= 3 && daysRemaining >= 0;
      
      if (isLast3Days && !hasReport) {
        // Last 3 days of month and no report submitted - send report reminder
        // Check if we've already sent a report reminder today
        const lastCheck = localStorage.getItem(this.LAST_CHECK_KEY);
        if (lastCheck) {
          const lastCheckDate = new Date(parseInt(lastCheck, 10));
          const today = new Date();
          
          // Check if it's the same day
          if (
            lastCheckDate.getDate() === today.getDate() &&
            lastCheckDate.getMonth() === today.getMonth() &&
            lastCheckDate.getFullYear() === today.getFullYear()
          ) {
            return; // Already sent report reminder today
          }
        }
        this.sendReportReminder();
        localStorage.setItem(this.LAST_CHECK_KEY, Date.now().toString());
      } else {
        // Every other day - send daily ministry reminder
        // Check if we've already sent the daily ministry reminder today
        const lastReminder = localStorage.getItem(this.LAST_DAILY_MINISTRY_REMINDER_KEY);
        if (lastReminder) {
          const lastReminderDate = new Date(parseInt(lastReminder, 10));
          const today = new Date();
          
          // Check if it's the same day
          if (
            lastReminderDate.getDate() === today.getDate() &&
            lastReminderDate.getMonth() === today.getMonth() &&
            lastReminderDate.getFullYear() === today.getFullYear()
          ) {
            console.log('Daily ministry reminder already sent today');
            return; // Already sent daily ministry reminder today
          }
        }
        this.sendDailyMinistryReminder();
        localStorage.setItem(this.LAST_DAILY_MINISTRY_REMINDER_KEY, Date.now().toString());
      }
    } catch (error) {
      console.error('Error checking notification status:', error);
    }
  }

  /**
   * Check if user has submitted a report for the current month
   */
  private async checkCurrentMonthReport(): Promise<boolean> {
    return new Promise((resolve) => {
      let subscription: any = null;
      let resolved = false;

      subscription = this.apiService.reports$.subscribe((reports) => {
        if (resolved) return;
        resolved = true;
        
        if (subscription) {
          subscription.unsubscribe();
        }
        
        if (!reports || reports.length === 0) {
          resolve(false);
          return;
        }

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // Check if there's a report for the current month
        const hasCurrentMonthReport = reports.some((report: any) => {
          if (!report.report_date) return false;

          let reportDate: Date;
          
          // Handle Firestore Timestamp
          if (report.report_date.toDate && typeof report.report_date.toDate === 'function') {
            reportDate = report.report_date.toDate();
          } else if (report.report_date.seconds) {
            reportDate = new Date(report.report_date.seconds * 1000);
          } else if (report.report_date instanceof Date) {
            reportDate = report.report_date;
          } else {
            reportDate = new Date(report.report_date);
          }

          const reportMonth = reportDate.getMonth();
          const reportYear = reportDate.getFullYear();

          return reportMonth === currentMonth && reportYear === currentYear;
        });

        resolve(hasCurrentMonthReport);
      });

      // Timeout after 5 seconds if no data comes
      setTimeout(() => {
        if (!resolved && subscription) {
          resolved = true;
          subscription.unsubscribe();
          resolve(false);
        }
      }, 5000);
    });
  }

  /**
   * Send daily ministry reminder
   */
  private sendDailyMinistryReminder() {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    const title = 'FSTracker Reminder!';
    const body = 'Don\'t forget to join the ministry. Your service is important!';

    // Use service worker if available, otherwise use regular notification
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        const options: any = {
          body: body,
          icon: '/assets/icons/fst-icon-192x192.png',
          badge: '/assets/icons/fst-icon-192x192.png',
          tag: 'daily-ministry-reminder',
          requireInteraction: false,
        };
        registration.showNotification(title, options);
      }).catch((error) => {
        console.error('Error showing daily reminder via service worker:', error);
        // Fallback to regular notification
        this.showRegularNotification(title, body);
      });
    } else {
      this.showRegularNotification(title, body);
    }
  }

  /**
   * Send a notification reminder to submit report (only in last 3 days of month)
   */
  private sendReportReminder() {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    const now = new Date();
    const monthName = now.toLocaleDateString('en-US', { month: 'long' });
    const year = now.getFullYear();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const daysRemaining = daysInMonth - dayOfMonth;

    const title = 'FSTracker Reminder!';
    const body = `Don't forget to submit your ${monthName} ${year} report! Only ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} left in the month.`;

    // Use service worker if available, otherwise use regular notification
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        // Use type assertion for service worker notification options which support actions
        const options: any = {
          body: body,
          icon: '/assets/icons/fst-icon-192x192.png',
          badge: '/assets/icons/fst-icon-192x192.png',
          tag: 'report-reminder',
          requireInteraction: false,
        };
        registration.showNotification(title, options);
      }).catch((error) => {
        console.error('Error showing notification via service worker:', error);
        // Fallback to regular notification
        this.showRegularNotification(title, body);
      });
    } else {
      this.showRegularNotification(title, body);
    }
  }

  /**
   * Show regular browser notification (fallback)
   */
  private showRegularNotification(title: string, body: string) {
    // Check if Notification API is available
    if (!('Notification' in window)) {
      console.warn('Notification API not available, cannot show notification');
      return;
    }
    
    // Check if permission is granted
    if (Notification.permission !== 'granted') {
      console.warn('Notification permission not granted, cannot show notification');
      return;
    }
    
    try {
      console.log('Creating regular notification:', { title, body });
      const notification = new Notification(title, {
        body: body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'report-reminder',
        requireInteraction: false
      });

      console.log('Notification created successfully');

      notification.onclick = () => {
        console.log('Notification clicked');
        window.focus();
        notification.close();
        // Navigate to reports page
        if (window.location.pathname !== '/reports') {
          window.location.href = '/reports';
        }
      };

      notification.onshow = () => {
        console.log('Notification shown');
      };

      notification.onerror = (error) => {
        console.error('Notification error:', error);
      };

      notification.onclose = () => {
        console.log('Notification closed');
      };
    } catch (error) {
      console.error('Error showing notification:', error);
      throw error;
    }
  }

  /**
   * Manually trigger a notification check (useful for testing)
   * Note: This respects the "already shown today" logic and won't show
   * notifications that have already been shown today
   */
  async manualCheck() {
    await this.checkAndNotify();
  }

  /**
   * Send a test notification immediately (for testing purposes)
   */
  async sendTestNotification() {
    if (!('Notification' in window)) {
      throw new Error('This browser does not support notifications');
    }

    if (Notification.permission !== 'granted') {
      throw new Error('Notification permission not granted. Current permission: ' + Notification.permission);
    }

    const now = new Date();
    const monthName = now.toLocaleDateString('en-US', { month: 'long' });
    const year = now.getFullYear();

    const title = '📋 Test Notification';
    const body = `This is a test notification for ${monthName} ${year} report reminder.`;

    console.log('Attempting to send test notification...');
    console.log('Notification permission:', Notification.permission);

    // In dev mode, service workers might not be active, so prefer regular notifications
    // which work immediately without service worker setup
    let useServiceWorker = false;
    
    if ('serviceWorker' in navigator) {
      try {
        // Check if service worker is already registered and active
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration && registration.active) {
          useServiceWorker = true;
          console.log('Service worker is active, will try to use it');
        } else {
          console.log('Service worker not active, using regular notification (better for dev mode)');
        }
      } catch (error) {
        console.warn('Error checking service worker:', error);
      }
    }

    if (useServiceWorker) {
      try {
        // Use service worker for production (longer timeout for production)
        const swPromise = navigator.serviceWorker.ready.then((registration) => {
          const options: any = {
            body: body,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag: 'test-notification',
            requireInteraction: false,
            actions: [
              {
                action: 'open',
                title: 'Submit Report'
              },
              {
                action: 'dismiss',
                title: 'Dismiss'
              }
            ],
            data: {
              url: '/reports'
            }
          };
          console.log('Showing notification via service worker');
          return registration.showNotification(title, options);
        });

        // Wait for service worker with longer timeout for production (5 seconds)
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Service worker timeout')), 5000)
        );

        await Promise.race([swPromise, timeoutPromise]);
        console.log('Notification sent via service worker');
        return;
      } catch (error) {
        console.warn('Service worker notification failed, using regular notification:', error);
        // Fall through to regular notification
      }
    }

    // Fallback to regular notification if service worker fails or isn't available
    console.log('Using regular browser notification');
    this.showRegularNotification(title, body);
  }

  /**
   * Set preferred notification time (for future use)
   */
  setNotificationTime(hour: number, minute: number = 0) {
    localStorage.setItem(this.NOTIFICATION_TIME_KEY, JSON.stringify({ hour, minute }));
  }

  /**
   * Get preferred notification time
   */
  getNotificationTime(): { hour: number; minute: number } {
    const stored = localStorage.getItem(this.NOTIFICATION_TIME_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
    return { hour: 6, minute: 0 }; // Default: 6:00 AM
  }
}
