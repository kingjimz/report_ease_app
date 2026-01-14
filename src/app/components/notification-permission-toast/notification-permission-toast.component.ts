import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../_services/notification.service';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-notification-permission-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-permission-toast.component.html',
  styleUrl: './notification-permission-toast.component.css',
})
export class NotificationPermissionToastComponent implements OnInit, OnDestroy {
  showPrompt = false;
  isRequesting = false;
  showTestButtons = false;
  isTesting = false;
  private permissionSubscription?: Subscription;

  constructor(
    private notificationService: NotificationService,
    private auth: Auth
  ) {}

  ngOnInit() {
    // Always attempt to show toast (even in dev, regardless of auth)
    this.checkAndShowToast();

    // Keep watching auth state in case the app expects it elsewhere
    onAuthStateChanged(this.auth, () => {
      // No gating on auth anymore; toast is controlled by permission + dismissal flag
      this.checkAndShowToast();
    });
  }

  private checkAndShowToast() {
    // Check if toast was dismissed
    const dismissed = localStorage.getItem('notification_toast_dismissed');
    if (dismissed === 'true') {
      return; // Don't show if dismissed
    }

    // Subscribe to permission changes
    this.permissionSubscription = this.notificationService.permission$.subscribe((permission) => {
      // Show toast if permission is default (not granted and not denied)
      if (!permission.granted && !permission.denied) {
        // Show after a short delay (3 seconds) to not be too intrusive
        setTimeout(() => {
          const stillDismissed = localStorage.getItem('notification_toast_dismissed');
          if (stillDismissed !== 'true') {
            this.showPrompt = true;
          }
        }, 3000);
      } else {
        this.showPrompt = false;
        this.showTestButtons = permission.granted;
      }
    });

    // Check initial permission status
    if ('Notification' in window) {
      const permission = Notification.permission;
      if (permission === 'default') {
        // Show after a short delay
        setTimeout(() => {
          const stillDismissed = localStorage.getItem('notification_toast_dismissed');
          if (stillDismissed !== 'true') {
            this.showPrompt = true;
          }
        }, 3000);
      } else if (permission === 'granted') {
        this.showTestButtons = true;
      }
    }
  }

  ngOnDestroy() {
    if (this.permissionSubscription) {
      this.permissionSubscription.unsubscribe();
    }
  }

  async requestPermission() {
    this.isRequesting = true;
    try {
      const granted = await this.notificationService.requestPermission();
      if (granted) {
        this.showPrompt = false;
        // Clear dismissal flag since permission is now granted
        localStorage.removeItem('notification_toast_dismissed');
        this.showTestButtons = true;
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
    } finally {
      this.isRequesting = false;
    }
  }

  async triggerTestNotification() {
    this.isTesting = true;
    try {
      await this.notificationService.sendTestNotification();
    } catch (error) {
      console.error('Error sending test notification:', error);
    } finally {
      this.isTesting = false;
    }
  }

  dismissPrompt() {
    this.showPrompt = false;
    // Store dismissal in localStorage to not show again (until page refresh or permission changes)
    localStorage.setItem('notification_toast_dismissed', 'true');
  }
}
