import { Component } from '@angular/core';
import { AuthService } from '../_services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent {

  constructor(private auth: AuthService, private route: Router) {
    this.auth.user$.subscribe((user) => {
      console.log(user);
    });
  }
  logout() {
    this.auth.logout();
    this.route.navigate(['/login']);
  }
}
