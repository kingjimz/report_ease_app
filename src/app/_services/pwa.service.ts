import { Injectable } from '@angular/core';
import { BehaviorSubject, fromEvent } from 'rxjs';
import { take } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class PwaService {
  private promptEvent: any = null;
  private installPromptSubject = new BehaviorSubject<boolean>(false);
  public showInstallPrompt$ = this.installPromptSubject.asObservable();

  constructor() {
    this.initPwaPrompt();
  }

  private initPwaPrompt() {
    // Listen for the beforeinstallprompt event
    fromEvent(window, 'beforeinstallprompt')
      .pipe(take(1))
      .subscribe((event: any) => {
        event.preventDefault();
        this.promptEvent = event;
        this.installPromptSubject.next(true);
      });

    // Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      console.log('App is already installed');
      this.installPromptSubject.next(false);
    }

    // Listen for successful app installation
    window.addEventListener('appinstalled', () => {
      console.log('PWA was installed successfully');
      this.promptEvent = null;
      this.installPromptSubject.next(false);
    });
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
  }
}





