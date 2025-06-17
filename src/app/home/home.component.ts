import { Component, HostListener } from '@angular/core';
import { AuthService } from '../_services/auth.service';
import { Router } from '@angular/router';
import { CalendarComponent } from '../components/calendar/calendar.component';
import { TabCardComponent } from '../components/tab-card/tab-card.component';
import { HeaderComponent } from '../components/header/header.component';
import { CommonModule } from '@angular/common';
import { ReportsComponent } from '../components/reports/reports.component';
import { SettingsComponent } from '../settings/settings.component';
import { DashboardComponent } from '../dashboard/dashboard.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CalendarComponent, TabCardComponent, HeaderComponent, CommonModule, ReportsComponent, SettingsComponent, DashboardComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent {
  activeTab = 'dashboard';
  showTab = true;
  selectedTab: string = 'dashboard';

  constructor(private auth: AuthService, private route: Router) {}

  private lastScrollTop = 0;
  private scrollThreshold = 40;

  @HostListener('window:scroll', [])
  onWindowScroll() {
    const st = window.pageYOffset || document.documentElement.scrollTop;
    const diff = Math.abs(st - this.lastScrollTop);

    if (diff > this.scrollThreshold) {
      if (st > this.lastScrollTop) {
        this.showTab = false;
        this.selectedTab = this.activeTab; 
      } else {
        this.showTab = true;
        this.activeTab = this.selectedTab; 
      }
      this.lastScrollTop = st <= 0 ? 0 : st;
    }
  }
  
  logout() {
    this.auth.logout();
    this.route.navigate(['/login']);
  }

  onTabChange(tabId: string) {
    this.activeTab = tabId;
    this.selectedTab = tabId;
  }


}


