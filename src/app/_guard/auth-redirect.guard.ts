import { Injectable, inject } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import { signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class AuthRedirectGuard implements CanActivate {
  private auth = inject(Auth);
  private router = inject(Router);
  private isAuthenticated = signal(false);

  constructor() {
    onAuthStateChanged(this.auth, (user) => {
      this.isAuthenticated.set(!!user);
    });
  }

  canActivate(): boolean {
    if (this.isAuthenticated()) {
      this.router.navigateByUrl('/', { replaceUrl: true });
      return false;
    }
    return true;
  }
}
