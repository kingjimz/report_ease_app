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
  updateComplete = false;
  progress = 0;
  private updateSubscription?: Subscription;
  private progressInterval?: ReturnType<typeof setInterval>;

  constructor(private swUpdateService: SwUpdateService) {}

  ngOnInit() {
    if (this.swUpdateService.isEnabled()) {
      this.updateSubscription = this.swUpdateService.updateAvailable$.subscribe(() => {
        this.showPrompt = true;
      });

      this.checkForUpdates();
    }
  }

  ngOnDestroy() {
    this.updateSubscription?.unsubscribe();
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
    }
  }

  async checkForUpdates() {
    await this.swUpdateService.checkForUpdates();
  }

  async updateApp() {
    this.isUpdating = true;
    this.progress = 0;
    this.startProgress();

    try {
      await this.swUpdateService.activateUpdate();
      this.finishProgress();
    } catch (error) {
      console.error('Error updating app:', error);
      this.isUpdating = false;
      this.progress = 0;
      if (this.progressInterval) {
        clearInterval(this.progressInterval);
      }
      alert('Failed to update. Please refresh the page manually.');
    }
  }

  private startProgress() {
    this.progressInterval = setInterval(() => {
      if (this.progress < 90) {
        this.progress += Math.random() * 15 + 5;
        if (this.progress > 90) this.progress = 90;
      }
    }, 300);
  }

  private finishProgress() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
    }
    this.progress = 100;
    this.updateComplete = true;

    setTimeout(() => {
      window.location.reload();
    }, 1200);
  }
}
