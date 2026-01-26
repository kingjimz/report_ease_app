import { Injectable, inject } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import { NetworkService } from '../_services/network.service';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  private auth = inject(Auth);
  private router = inject(Router);
  private networkService = inject(NetworkService);

  canActivate(): Promise<boolean> {
    // Wait for initial auth state to be determined (critical for iOS where Firebase Auth can be slow)
    return new Promise<boolean>((resolve) => {
      // Use a timeout to prevent infinite waiting on iOS
      const timeout = setTimeout(() => {
        // If auth state hasn't been determined after 3 seconds, check current user
        const user = this.auth.currentUser;
        if (user) {
          resolve(true);
        } else {
          // Only redirect to login if online
          if (this.networkService.isOnline) {
            this.router.navigateByUrl('/login', { replaceUrl: true });
          }
          resolve(false);
        }
      }, 3000); // 3 second timeout for iOS

      // Listen for auth state change
      const unsubscribe = onAuthStateChanged(
        this.auth,
        (user) => {
          clearTimeout(timeout);
          unsubscribe();
          
          if (user) {
            resolve(true);
          } else {
            // Only redirect to login if online (offline users should stay on current page)
            if (this.networkService.isOnline) {
              this.router.navigateByUrl('/login', { replaceUrl: true });
            }
            resolve(false);
          }
        },
        (error) => {
          // Handle auth errors gracefully
          clearTimeout(timeout);
          unsubscribe();
          console.error('Auth state check error:', error);
          
          // On error, check current user as fallback
          const user = this.auth.currentUser;
          if (user) {
            resolve(true);
          } else {
            if (this.networkService.isOnline) {
              this.router.navigateByUrl('/login', { replaceUrl: true });
            }
            resolve(false);
          }
        }
      );
    });
  }
}
