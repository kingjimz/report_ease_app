import { Injectable, inject } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import { signal } from '@angular/core';
import { NetworkService } from '../_services/network.service';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  private auth = inject(Auth);
  private router = inject(Router);
  private networkService = inject(NetworkService);
  private isAuthenticated = signal(false);

  constructor() {
    onAuthStateChanged(this.auth, (user) => {
      this.isAuthenticated.set(!!user);
      // If offline and user exists, allow access (Firebase Auth persists user state)
      if (!this.networkService.isOnline && user) {
        console.log('Offline mode: User authenticated from cache');
      }
    });
  }

  canActivate(): boolean {
    // Allow access if authenticated (works offline - Firebase Auth persists state)
    if (this.isAuthenticated()) {
      return true;
    } else {
      // Only redirect to login if online (offline users should stay on current page)
      if (this.networkService.isOnline) {
        this.router.navigateByUrl('/login', { replaceUrl: true });
      }
      return false;
    }
  }
}
