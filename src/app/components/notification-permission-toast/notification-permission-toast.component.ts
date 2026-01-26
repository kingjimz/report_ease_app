import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService, NotificationPermission } from '../../_services/notification.service';
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
  isBlocked = false; // Track if permission is blocked
  private permissionSubscription?: Subscription;

  constructor(
    private notificationService: NotificationService,
    private auth: Auth
  ) {}

  ngOnInit() {
    // Check permission immediately on component init (before subscription)
    this.checkInitialPermission();
    
    // Subscribe to permission changes from service
    this.permissionSubscription = this.notificationService.permission$.subscribe((permission) => {
      this.updateToastVisibility(permission);
    });

    // Also watch auth state changes
    onAuthStateChanged(this.auth, () => {
      // Re-check when auth state changes
      setTimeout(() => {
        this.checkInitialPermission();
      }, 500);
    });
  }

  private checkInitialPermission() {
    if (!('Notification' in window)) {
      return;
    }

    const permission = Notification.permission;
    const permissionState: NotificationPermission = {
      granted: permission === 'granted',
      denied: permission === 'denied',
      default: permission === 'default'
    };
    
    this.updateToastVisibility(permissionState);
  }

  private updateToastVisibility(permission: NotificationPermission) {
    console.log('Notification permission status:', permission);
    
    // If permission is denied (blocked), always show the toast
    if (permission.denied) {
      console.log('Permission is denied (blocked), showing toast');
      // Clear dismissal flag when permission is denied so toast can always show
      localStorage.removeItem('notification_toast_dismissed');
      this.isBlocked = true;
      // Show immediately when blocked (shorter delay)
      setTimeout(() => {
        this.showPrompt = true;
        console.log('Toast should now be visible (blocked)');
      }, 500);
      return;
    }

    // If permission is granted, hide prompt
    if (permission.granted) {
      console.log('Permission is granted, hiding prompt');
      this.showPrompt = false;
      this.isBlocked = false;
      return;
    }

    // If permission is default (not yet requested)
    if (permission.default) {
      console.log('Permission is default, checking dismissal status');
      this.isBlocked = false;
      const dismissed = localStorage.getItem('notification_toast_dismissed');
      
      // Only show if not dismissed
      if (dismissed !== 'true') {
        console.log('Not dismissed, will show toast after delay');
        // Show after a short delay (1.5 seconds) to not be too intrusive
        setTimeout(() => {
          const stillDismissed = localStorage.getItem('notification_toast_dismissed');
          if (stillDismissed !== 'true') {
            this.showPrompt = true;
            console.log('Toast should now be visible (default)');
          }
        }, 1500);
      } else {
        console.log('Toast was dismissed, not showing');
        this.showPrompt = false;
      }
    }
  }

  ngOnDestroy() {
    if (this.permissionSubscription) {
      this.permissionSubscription.unsubscribe();
    }
  }

  async requestPermission() {
    // If permission is blocked, we can't request it programmatically
    // User needs to enable it in browser settings
    if (this.isBlocked) {
      // Show alert or message about enabling in browser settings
      alert('Notifications are blocked. Please enable them in your browser settings:\n\nChrome/Edge: Settings > Privacy and security > Site settings > Notifications\n\nFirefox: Settings > Privacy & Security > Permissions > Notifications\n\nSafari: Preferences > Websites > Notifications');
      return;
    }
    
    this.isRequesting = true;
    try {
      const granted = await this.notificationService.requestPermission();
      if (granted) {
        this.showPrompt = false;
        this.isBlocked = false;
        // Clear dismissal flag since permission is now granted
        localStorage.removeItem('notification_toast_dismissed');
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
    } finally {
      this.isRequesting = false;
    }
  }

  dismissPrompt() {
    // Don't allow dismissing if permission is blocked - user needs to see instructions
    if (this.isBlocked) {
      return;
    }
    this.showPrompt = false;
    // Store dismissal in localStorage to not show again (until page refresh or permission changes)
    localStorage.setItem('notification_toast_dismissed', 'true');
  }
}
