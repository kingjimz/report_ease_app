import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../_services/auth.service';
import { SettingsService } from '../../_services/settings.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule, ThemeToggleComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css',
})
export class HeaderComponent implements OnInit {
  dropdownOpen = false;
  userData: any;
  showConfigureModal = false;
  isPioneer = false;
  showSuccessMessage = false;
  successMessage = '';

  constructor(
    private authService: AuthService,
    private router: Router,
    private settingsService: SettingsService
  ) {
    this.authService.user$.subscribe((user) => {
      this.userData = user;
    });
  }

  ngOnInit() {
    this.loadSettings();
  }

  loadSettings() {
    this.settingsService.settings$.subscribe(settings => {
      this.isPioneer = settings.isPioneer;
    });
  }

  toggleDropdown() {
    this.dropdownOpen = !this.dropdownOpen;
  }

  signOut() {
    this.authService.logout();
  }

  openConfigureModal() {
    this.showConfigureModal = true;
    this.dropdownOpen = false;
  }

  closeConfigureModal() {
    this.showConfigureModal = false;
    this.showSuccessMessage = false;
  }

  togglePioneerStatus() {
    this.settingsService.setIsPioneer(this.isPioneer);
    this.showSuccessMessage = true;
    this.successMessage = `Pioneer status ${this.isPioneer ? 'enabled' : 'disabled'}. Dashboard updated!`;
    
    setTimeout(() => {
      this.showSuccessMessage = false;
    }, 3000);
  }
}
