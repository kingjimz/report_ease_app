import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Auth, signInWithPopup, signOut } from '@angular/fire/auth';
import { GoogleAuthProvider } from 'firebase/auth';

import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'report_ease_app';

  user: any;

  constructor(private auth: Auth) {
    this.auth.onAuthStateChanged(user => this.user = user);
  }

  login() {
    signInWithPopup(this.auth, new GoogleAuthProvider());
  }

  logout() {
    signOut(this.auth);
  }
}
