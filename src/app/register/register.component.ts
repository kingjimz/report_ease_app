import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../_services/auth.service';
import { RouterLink } from '@angular/router';
import { ThemeService } from '../services/theme.service';
import { AlertsComponent } from '../components/alerts/alerts.component';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    AlertsComponent,
  ],
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
