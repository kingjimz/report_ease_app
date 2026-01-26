import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class PwaService {
  private promptEvent: any = null;
  private installPromptSubject = new BehaviorSubject<boolean>(false);
  public showInstallPrompt$ = this.installPromptSubject.asObservable();
  private readonly LAST_PROMPT_KEY = 'pwa_install_prompt_last_shown';
  private readonly PROMPT_DISMISSED_KEY = 'pwa_install_prompt_dismissed';

  constructor() {
    this.initPwaPrompt();
  }

  private initPwaPrompt() {
    // Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      console.log('App is already installed');
      this.installPromptSubject.next(false);
      return;
    }

    // Listen for the beforeinstallprompt event (don't use take(1) so we can capture it anytime)
    window.addEventListener('beforeinstallprompt', (event: any) => {
      event.preventDefault();
      this.promptEvent = event;
      // Make prompt available immediately for install page
      this.installPromptSubject.next(true);
      // Also check if we should show the auto-prompt
      this.checkAndShowPrompt();
    });

    // Listen for successful app installation
    window.addEventListener('appinstalled', () => {
      console.log('PWA was installed successfully');
      this.promptEvent = null;
      this.installPromptSubject.next(false);
      // Clear all tracking when installed
      localStorage.removeItem(this.LAST_PROMPT_KEY);
      localStorage.removeItem(this.PROMPT_DISMISSED_KEY);
    });
  }

  private checkAndShowPrompt() {
    // Must have a prompt event to show
    if (!this.promptEvent) {
      return;
    }

    // Check if prompt was dismissed
    const dismissed = localStorage.getItem(this.PROMPT_DISMISSED_KEY);
    if (dismissed === 'true') {
      // Check if it's been more than 24 hours since dismissal
      const lastShown = localStorage.getItem(this.LAST_PROMPT_KEY);
      if (lastShown) {
        const lastShownDate = new Date(parseInt(lastShown, 10));
        const now = new Date();
        const hoursSinceLastShown = (now.getTime() - lastShownDate.getTime()) / (1000 * 60 * 60);
        
        // If more than 24 hours, clear dismissal and allow showing again
        if (hoursSinceLastShown >= 24) {
          localStorage.removeItem(this.PROMPT_DISMISSED_KEY);
        } else {
          // Don't show if dismissed within last 24 hours
          this.installPromptSubject.next(false);
          return;
        }
      }
    }

    // Check if we've shown the prompt today
    const lastShown = localStorage.getItem(this.LAST_PROMPT_KEY);
    if (lastShown) {
      const lastShownDate = new Date(parseInt(lastShown, 10));
      const today = new Date();
      
      // Check if it's the same day
      if (
        lastShownDate.getDate() === today.getDate() &&
        lastShownDate.getMonth() === today.getMonth() &&
        lastShownDate.getFullYear() === today.getFullYear()
      ) {
        // Already shown today, don't show again
        this.installPromptSubject.next(false);
        return;
      }
    }

    // Show prompt after a short delay
    setTimeout(() => {
      this.installPromptSubject.next(true);
      // Mark as shown today
      localStorage.setItem(this.LAST_PROMPT_KEY, Date.now().toString());
    }, 2000); // 2 second delay
  }

  async installPwa(): Promise<boolean> {
    if (!this.promptEvent) {
      return false;
    }

    this.promptEvent.prompt();
    const { outcome } = await this.promptEvent.userChoice;
    
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
      this.promptEvent = null;
      this.installPromptSubject.next(false);
      return true;
    } else {
      console.log('User dismissed the install prompt');
      return false;
    }
  }

  dismissPrompt() {
    this.installPromptSubject.next(false);
    // Mark as dismissed (will show again after 24 hours)
    localStorage.setItem(this.PROMPT_DISMISSED_KEY, 'true');
    localStorage.setItem(this.LAST_PROMPT_KEY, Date.now().toString());
  }

  /**
   * Check if installation is available
   * Useful for install pages to check if they can trigger installation
   */
  isInstallAvailable(): boolean {
    return this.promptEvent !== null;
  }

  /**
   * Get the prompt event if available
   * This allows install pages to use the prompt directly
   */
  getPromptEvent(): any {
    return this.promptEvent;
  }
}





