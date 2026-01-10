import { Component, OnInit } from '@angular/core';
import { AuthService } from '../_services/auth.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ThemeService } from '../services/theme.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent implements OnInit {
  email = '';
  password = '';
  errorMessage = '';
  isLoading = false;

  constructor(
    private auth: AuthService,
    private route: Router,
    private themeService: ThemeService,
  ) {}

  ngOnInit(): void {
    // Ensure theme is applied on component initialization
    const isDark = this.themeService.isDarkMode();
    this.themeService.setTheme(isDark);
  }

  async login() {
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
