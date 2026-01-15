import { Injectable } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter, interval, fromEvent, BehaviorSubject, Observable } from 'rxjs';
import { isDevMode } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SwUpdateService {
  private readonly CHECK_INTERVAL = 60 * 60 * 1000; // Check every 1 hour (more frequent for production)
  private updateAvailable = false;
  private updateAvailableSubject = new BehaviorSubject<boolean>(false);

  constructor(private swUpdate: SwUpdate) {
    // Only initialize if service worker is enabled
    if (swUpdate.isEnabled) {
      this.initializeUpdateChecks();
    } else {
      console.log('Service Worker updates are not enabled (may be disabled on iOS or in dev mode)');
    }
  }

  private initializeUpdateChecks() {
    // Check for updates on service initialization
    this.checkForUpdates();

    // Periodically check for updates
    interval(this.CHECK_INTERVAL).subscribe(() => {
      this.checkForUpdates();
    });

    // Check for updates when app comes back online
    if (typeof window !== 'undefined') {
      fromEvent(window, 'online').subscribe(() => {
        console.log('App is back online, checking for updates...');
        this.checkForUpdates();
      });

      // Check for updates when window regains focus (user returns to app)
      fromEvent(window, 'focus').subscribe(() => {
        console.log('Window regained focus, checking for updates...');
        this.checkForUpdates();
      });
    }

    // Listen for available updates
    this.swUpdate.versionUpdates
      .pipe(
        filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY')
      )
      .subscribe((event) => {
        console.log('New version available', event);
        this.updateAvailable = true;
        this.updateAvailableSubject.next(true);
      });

    // Listen for update activation
    this.swUpdate.versionUpdates
      .pipe(
        filter(evt => evt.type === 'VERSION_INSTALLATION_FAILED')
      )
      .subscribe(() => {
        console.error('Update installation failed');
      });
  }

  /**
   * Check for updates manually
   */
  async checkForUpdates(): Promise<boolean> {
    if (!this.swUpdate.isEnabled) {
      return false;
    }

    try {
      const updateAvailable = await this.swUpdate.checkForUpdate();
      console.log('Update check result:', updateAvailable);
      
      // Also check if update is already available
      if (this.updateAvailable) {
        return true;
      }
      
      return updateAvailable;
    } catch (error) {
      console.error('Error checking for updates:', error);
      return false;
    }
  }

  /**
   * Activate the update (reload the app with new version)
   */
  async activateUpdate(): Promise<boolean> {
    if (!this.swUpdate.isEnabled) {
      return false;
    }

    try {
      await this.swUpdate.activateUpdate();
      // Reload the page to use the new version
      window.location.reload();
      return true;
    } catch (error) {
      console.error('Error activating update:', error);
      return false;
    }
  }

  /**
   * Check if an update is available
   */
  isUpdateAvailable(): boolean {
    return this.updateAvailable;
  }

  /**
   * Get observable for update availability
   */
  get updateAvailable$(): Observable<VersionReadyEvent> {
    return this.swUpdate.versionUpdates.pipe(
      filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY')
    );
  }

  /**
   * Get observable for update availability status (boolean)
   */
  get updateAvailableStatus$(): Observable<boolean> {
    return this.updateAvailableSubject.asObservable();
  }

  /**
   * Check if service worker updates are enabled
   */
  isEnabled(): boolean {
    return this.swUpdate.isEnabled;
  }
}
