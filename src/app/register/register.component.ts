import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../_services/auth.service';
import { RouterLink } from '@angular/router';
import { ThemeService } from '../services/theme.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
})
export class RegisterComponent implements OnInit {
  email = '';
  password = '';
  confirmPassword = '';
  errorMessage = '';

  constructor(
    private authService: AuthService,
    private themeService: ThemeService,
  ) {}

  ngOnInit(): void {
    // Ensure theme is applied on component initialization
    const isDark = this.themeService.isDarkMode();
    this.themeService.setTheme(isDark);
  }

  signUp() {
    if (this.password !== this.confirmPassword) {
      this.errorMessage = 'Passwords do not match';
      return;
    }

    this.authService
      .signUp(this.email, this.password)
      .then(() => {
        console.log('User signed up');
      })
      .catch((error) => {
        console.error('Error signing up:', error);
        this.errorMessage = error.message;
      });
  }
}
