import { Component, OnInit, OnDestroy } from '@angular/core';
import { AuthService } from '../_services/auth.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ThemeService } from '../services/theme.service';
import { NetworkService } from '../_services/network.service';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent implements OnInit, OnDestroy {
  email = '';
  password = '';
  errorMessage = '';
  isLoading = false;
  isOnline = true;
  private networkSubscription?: Subscription;
  private authSubscription?: () => void;

  constructor(
    private auth: AuthService,
    private route: Router,
    private themeService: ThemeService,
    private networkService: NetworkService,
    private firebaseAuth: Auth,
  ) {}

  ngOnInit(): void {
    // Ensure theme is applied on component initialization
    const isDark = this.themeService.isDarkMode();
    this.themeService.setTheme(isDark);

    // Check network status
    this.isOnline = this.networkService.isOnline;
    this.networkSubscription = this.networkService.onlineStatus$.subscribe((isOnline) => {
      this.isOnline = isOnline;
      if (!isOnline) {
        this.errorMessage = 'You are offline. Login is disabled. The app will auto-login if you were previously logged in.';
      } else {
        this.errorMessage = '';
      }
    });

    // Check if user is already authenticated (works offline - Firebase Auth persists state)
    this.authSubscription = onAuthStateChanged(this.firebaseAuth, (user) => {
      if (user) {
        // User is authenticated, redirect to home
        this.route.navigate(['/']);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.networkSubscription) {
      this.networkSubscription.unsubscribe();
    }
    if (this.authSubscription) {
      this.authSubscription();
    }
  }

  async login() {
    if (!this.isOnline) {
      this.errorMessage = 'Cannot login while offline. Please check your internet connection.';
      return;
    }
    try {
      this.isLoading = true;
      await this.auth.login(this.email, this.password);
      this.isLoading = false;
    } catch (error) {
      this.errorMessage = (error as Error).message;
      this.isLoading = false;
    }
  }

  async signInWithGoogle() {
    if (!this.isOnline) {
      this.errorMessage = 'Cannot login while offline. Please check your internet connection.';
      return;
    }
    try {
      this.isLoading = true;
      await this.auth.signinWithGoogle();
      this.isLoading = false;
      this.route.navigate(['/']);
    } catch (error) {
      this.errorMessage = (error as Error).message;
      this.isLoading = false;
    }
  }
}
