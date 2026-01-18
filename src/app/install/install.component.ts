import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PwaService } from '../_services/pwa.service';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-install',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './install.component.html',
  styleUrls: ['./install.component.css']
})
export class InstallComponent implements OnInit, OnDestroy {
  isIOS = false;
  isAndroid = false;
  isDesktop = false;
  isStandalone = false;
  canInstall = false;
  platform = '';
  isInstalling = false;
  installError = '';
  private destroy$ = new Subject<void>();
  private deferredPrompt: any = null;

  constructor(
    private pwaService: PwaService,
    private router: Router
  ) {}

  ngOnInit() {
    this.detectPlatform();
    this.checkInstallability();
    
    // Subscribe to install prompt availability from PWA service
    this.pwaService.showInstallPrompt$
      .pipe(takeUntil(this.destroy$))
      .subscribe(available => {
        this.canInstall = available;
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private detectPlatform() {
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    
    // Check if already installed
    this.isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                       (window.navigator as any).standalone === true;
    
    // Detect iOS
    this.isIOS = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;
    
    // Detect Android
    this.isAndroid = /android/i.test(userAgent);
    
    // Detect Desktop (Windows, Mac, Linux)
    this.isDesktop = !this.isIOS && !this.isAndroid;
    
    // Set platform name
    if (this.isIOS) {
      this.platform = 'iOS';
    } else if (this.isAndroid) {
      this.platform = 'Android';
    } else {
      this.platform = 'Desktop';
    }
  }

  private checkInstallability() {
    // Check if PWA service already has a prompt event
    if (this.pwaService.isInstallAvailable()) {
      this.deferredPrompt = this.pwaService.getPromptEvent();
      this.canInstall = true;
    }

    // Listen for the beforeinstallprompt event (in case it fires after component loads)
    const beforeInstallHandler = (e: any) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.canInstall = true;
    };
    window.addEventListener('beforeinstallprompt', beforeInstallHandler);

    // Check if already installed
    const installedHandler = () => {
      this.canInstall = false;
      this.deferredPrompt = null;
      this.isStandalone = true;
    };
    window.addEventListener('appinstalled', installedHandler);

    // Clean up listeners on destroy
    this.destroy$.subscribe(() => {
      window.removeEventListener('beforeinstallprompt', beforeInstallHandler);
      window.removeEventListener('appinstalled', installedHandler);
    });
  }

  async installApp() {
    this.isInstalling = true;
    this.installError = '';

    try {
      // First, try to get the prompt from PWA service if we don't have it
      if (!this.deferredPrompt && this.pwaService.isInstallAvailable()) {
        this.deferredPrompt = this.pwaService.getPromptEvent();
      }

      if (this.deferredPrompt) {
        // Use the deferred prompt directly
        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
          console.log('User accepted the install prompt');
          this.canInstall = false;
          this.deferredPrompt = null;
          // Redirect to home after installation
          setTimeout(() => {
            this.router.navigate(['/']);
          }, 1000);
        } else {
          console.log('User dismissed the install prompt');
          this.isInstalling = false;
        }
      } else {
        // Fallback to PWA service
        const installed = await this.pwaService.installPwa();
        if (installed) {
          // Redirect to home after installation
          setTimeout(() => {
            this.router.navigate(['/']);
          }, 1000);
        } else {
          this.installError = 'Installation prompt is not available. Please try refreshing the page or use the manual installation method.';
          this.isInstalling = false;
        }
      }
    } catch (error) {
      console.error('Installation error:', error);
      this.installError = 'An error occurred during installation. Please try again or use the manual installation method.';
      this.isInstalling = false;
    }
  }

  goHome() {
    this.router.navigate(['/']);
  }
}
