import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, interval } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class VersionService {
  private readonly VERSION_URL = '/version.json';
  private readonly CHECK_INTERVAL = 30 * 60 * 1000; // Check every 30 minutes
  private currentVersion: string = '1.0.0';
  private updateAvailableSubject = new BehaviorSubject<boolean>(false);
  public updateAvailable$: Observable<boolean> = this.updateAvailableSubject.asObservable();

  constructor() {
    // Get current version from localStorage or default
    this.currentVersion = this.getCurrentVersion();
  }

  /**
   * Initialize version checking for iOS devices
   */
  initializeVersionChecking(): void {
    // Check immediately
    this.checkVersion();
    
    // Check periodically
    interval(this.CHECK_INTERVAL).subscribe(() => {
      this.checkVersion();
    });
  }

  /**
   * Check for version updates by fetching version.json
   */
  async checkVersion(): Promise<boolean> {
    try {
      // Use cache: 'no-cache' to ensure we get the latest version
      const response = await fetch(this.VERSION_URL + '?t=' + Date.now(), {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!response.ok) {
        console.log('Version check failed: HTTP', response.status);
        return false;
      }

      const data = await response.json();
      const serverVersion = data.version || data.appVersion || '1.0.0';
      
      if (serverVersion !== this.currentVersion) {
        console.log('New version detected:', serverVersion, 'Current:', this.currentVersion);
        this.updateAvailableSubject.next(true);
        return true;
      } else {
        // Versions match - update stored version to ensure it's in sync
        this.setCurrentVersion(serverVersion);
        // Clear the update available flag since we're on the latest version
        if (this.updateAvailableSubject.value) {
          console.log('Versions match - clearing update flag. Current version:', serverVersion);
          this.updateAvailableSubject.next(false);
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error checking version:', error);
      return false;
    }
  }

  /**
   * Get current app version
   */
  private getCurrentVersion(): string {
    // Try to get from localStorage (set during build or app init)
    const storedVersion = localStorage.getItem('app_version');
    if (storedVersion) {
      return storedVersion;
    }
    
    // Default version
    return '1.0.0';
  }

  /**
   * Set current app version (called during app initialization)
   */
  setCurrentVersion(version: string): void {
    this.currentVersion = version;
    localStorage.setItem('app_version', version);
  }

  /**
   * Check if update is available
   */
  isUpdateAvailable(): boolean {
    return this.updateAvailableSubject.value;
  }

  /**
   * Reload app to get new version
   */
  reloadApp(): void {
    window.location.reload();
  }
}
