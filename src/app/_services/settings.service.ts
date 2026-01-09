import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

interface UserSettings {
  isPioneer: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private readonly STORAGE_KEY = 'user_settings';
  
  private settingsSubject = new BehaviorSubject<UserSettings>(this.loadSettings());
  public settings$ = this.settingsSubject.asObservable();

  constructor() {}

  /**
   * Load settings from localStorage
   */
  private loadSettings(): UserSettings {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error('Error parsing settings:', e);
      }
    }
    return {
      isPioneer: false  // Default to false - will be set during onboarding
    };
  }

  /**
   * Save settings to localStorage
   */
  private saveSettings(settings: UserSettings): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
    this.settingsSubject.next(settings);
  }

  /**
   * Get current settings
   */
  getSettings(): UserSettings {
    return this.settingsSubject.value;
  }

  /**
   * Update pioneer status
   */
  setIsPioneer(isPioneer: boolean): void {
    const settings = this.getSettings();
    settings.isPioneer = isPioneer;
    this.saveSettings(settings);
  }

  /**
   * Check if user is a pioneer
   */
  isPioneer(): boolean {
    return this.getSettings().isPioneer;
  }
}




