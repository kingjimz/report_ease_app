import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../_services/auth.service';


@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent {
  dropdownOpen = false;
  userData: any;

  constructor(private authService: AuthService) {
    this.authService.user$.subscribe((user) => {
      this.userData = user;
    });
  }

  toggleDropdown() {
    this.dropdownOpen = !this.dropdownOpen;
  }


  signOut() {
    this.authService.logout();
  }

}
