import { Component } from '@angular/core';
import { AuthService } from '../_services/auth.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  email = '';
  password = '';
  errorMessage = '';

  constructor(private auth: AuthService, private route: Router) {}

  async login() {
    try {
      await this.auth.login(this.email, this.password);
    } catch (error) {
      this.errorMessage = (error as Error).message;
  }
}

async signInWithGoogle() {
  try {
    await this.auth.signinWithGoogle();
    this.route.navigate(['/']);
  } catch (error) {
    this.errorMessage = (error as Error).message;
  }
}
}
