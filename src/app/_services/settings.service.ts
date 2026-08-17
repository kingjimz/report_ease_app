import { Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { BehaviorSubject } from 'rxjs';

interface UserSettings {
  isPioneer: boolean;
  locationEnabled: boolean;
  shareLiveLocation: boolean;
  /** Group this device broadcasts into. Null means "not sharing anywhere". */
  activeGroupId: string | null;
}

/** Key used before settings were namespaced per user; migrated once, then removed. */
const LEGACY_STORAGE_KEY = 'user_settings';
/** Namespace for a signed-out (or pre-auth) session. */
const ANONYMOUS_KEY = 'user_settings:anonymous';

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  /**
   * Storage key for the user currently signed in. Settings are namespaced by
   * uid because they are not all harmless preferences: activeGroupId and
   * shareLiveLocation together decide where this device broadcasts a live
   * position. On a shared device, an unnamespaced key would have the second
   * user silently inherit the first user's group and start broadcasting into it.
   */
  private storageKey = ANONYMOUS_KEY;

  private settingsSubject = new BehaviorSubject<UserSettings>(this.loadSettings());
  public settings$ = this.settingsSubject.asObservable();

  constructor(private auth: Auth) {
    this.auth.onAuthStateChanged((user) => {
      this.storageKey = user ? `${LEGACY_STORAGE_KEY}:${user.uid}` : ANONYMOUS_KEY;
      if (user) this.migrateLegacySettings();
      this.settingsSubject.next(this.loadSettings());
    });

    // Another tab changing settings must not leave this tab acting on a stale
    // cached copy - with groups that means broadcasting into the group the user
    // just switched away from. The storage event only fires in *other* tabs,
    // so there is no echo to guard against.
    window.addEventListener('storage', (event) => {
      if (event.key !== this.storageKey) return;
      this.settingsSubject.next(this.loadSettings());
    });
  }

  /**
   * Adopt pre-namespacing settings for the first user to sign in after the
   * upgrade, then drop the old key so a second user on the same device starts
   * from defaults instead of inheriting them.
   */
  private migrateLegacySettings(): void {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacy) return;
    if (!localStorage.getItem(this.storageKey)) {
      localStorage.setItem(this.storageKey, legacy);
    }
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }

  /**
   * Load settings from localStorage
   */
  private loadSettings(): UserSettings {
    const stored = localStorage.getItem(this.storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return {
          isPioneer: parsed.isPioneer ?? false,
          // Default existing users to on so weather keeps working.
          locationEnabled: parsed.locationEnabled ?? true,
          // Live location sharing is strictly opt-in.
          shareLiveLocation: parsed.shareLiveLocation ?? false,
          activeGroupId: parsed.activeGroupId ?? null,
        };
      } catch (e) {
        console.error('Error parsing settings:', e);
      }
    }
    return {
      isPioneer: false, // Default to false - will be set during onboarding
      locationEnabled: true, // Weather/location on by default
      shareLiveLocation: false, // Live sharing is strictly opt-in
      activeGroupId: null, // No group until the user creates or joins one
    };
  }

  /**
   * Save settings to localStorage
   */
  private saveSettings(settings: UserSettings): void {
    localStorage.setItem(this.storageKey, JSON.stringify(settings));
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

  /**
   * Update location/weather access preference
   */
  setLocationEnabled(locationEnabled: boolean): void {
    const settings = this.getSettings();
    settings.locationEnabled = locationEnabled;
    this.saveSettings(settings);
  }

  /**
   * Check if location/weather is enabled
   */
  isLocationEnabled(): boolean {
    return this.getSettings().locationEnabled;
  }

  /**
   * Update live location sharing preference (map feature opt-in)
   */
  setLiveShareEnabled(shareLiveLocation: boolean): void {
    const settings = this.getSettings();
    settings.shareLiveLocation = shareLiveLocation;
    this.saveSettings(settings);
  }

  /**
   * Check if live location sharing is enabled
   */
  isLiveShareEnabled(): boolean {
    return this.getSettings().shareLiveLocation;
  }

  /**
   * Set the group this device shares into. Per-device on purpose: two phones
   * signed into the same account can sensibly be in different groups.
   */
  setActiveGroupId(activeGroupId: string | null): void {
    const settings = this.getSettings();
    settings.activeGroupId = activeGroupId;
    this.saveSettings(settings);
  }

  /**
   * Group this device shares into, if any.
   */
  getActiveGroupId(): string | null {
    return this.getSettings().activeGroupId;
  }
}
