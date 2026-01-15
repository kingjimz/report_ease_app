import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SwUpdateService } from '../../_services/sw-update.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-app-update-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app-update-toast.component.html',
  styleUrl: './app-update-toast.component.css',
})
export class AppUpdateToastComponent implements OnInit, OnDestroy {
  showPrompt = false;
  isUpdating = false;
  private updateSubscription?: Subscription;

  constructor(private swUpdateService: SwUpdateService) {}

  ngOnInit() {
    // Only subscribe if service worker is enabled
    if (this.swUpdateService.isEnabled()) {
      // Subscribe to update availability
      this.updateSubscription = this.swUpdateService.updateAvailable$.subscribe(() => {
        // Only show if not dismissed recently
        if (this.shouldShowPrompt()) {
          this.showPrompt = true;
        }
      });

      // Also check on component init
      this.checkForUpdates();
    }
  }

  ngOnDestroy() {
    if (this.updateSubscription) {
      this.updateSubscription.unsubscribe();
    }
  }

  async checkForUpdates() {
    await this.swUpdateService.checkForUpdates();
  }

  async updateApp() {
    this.isUpdating = true;
    try {
      await this.swUpdateService.activateUpdate();
      // Page will reload automatically after activation
    } catch (error) {
      console.error('Error updating app:', error);
      this.isUpdating = false;
      alert('Failed to update the app. Please try refreshing the page manually.');
    }
  }

  dismissPrompt() {
    this.showPrompt = false;
    // Store dismissal in localStorage (will show again after 24 hours)
    localStorage.setItem('app_update_dismissed', Date.now().toString());
  }

  private shouldShowPrompt(): boolean {
    const dismissed = localStorage.getItem('app_update_dismissed');
    if (!dismissed) {
      return true;
    }

    const dismissedTime = parseInt(dismissed, 10);
    const now = Date.now();
    const hoursSinceDismissed = (now - dismissedTime) / (1000 * 60 * 60);

    // Show again after 24 hours
    return hoursSinceDismissed >= 24;
  }
}
