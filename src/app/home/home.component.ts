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
import { ModalComponent } from '../components/modal/modal.component';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../_services/api.service';
import { AlertsComponent } from '../components/alerts/alerts.component';
import { UtilService } from '../_services/util.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CalendarComponent,
    TabCardComponent,
    HeaderComponent,
    CommonModule,
    ReportsComponent,
    SettingsComponent,
    DashboardComponent,
    ModalComponent,
    FormsModule,
    AlertsComponent,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  activeTab = 'dashboard';
  showTab = true;
  selectedTab: string = 'dashboard';
  showManualReportModal = false;

  // Manual report form fields
  reportDate = '';
  hours = 0;
  bibleStudiesCount = 0;
  joined_ministry = 'yes';
  note = '';
  isSuccess = false;
  alertMessage = '';
  isSubmitting = false;
  isPioneer = false;
  bibleStudies: any[] = [];

  constructor(
    private auth: AuthService,
    private route: Router,
    private api: ApiService,
    private util: UtilService,
  ) {
    // Set default date to today
    const today = new Date();
    this.reportDate = today.toISOString().split('T')[0];

    // Load Bible studies
    this.loadBibleStudies();
  }

  loadBibleStudies() {
    this.api.bibleStudies$.subscribe((data) => {
      if (data && data.length > 0) {
        this.bibleStudies = data;
      }
    });
  }

  filterBibleStudies(studies: any[]): any[] {
    return studies.filter((study) => study.type !== 'rv');
  }

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

  onManualReportModalOpen() {
    this.showManualReportModal = true;
  }

  closeManualReportModal() {
    this.showManualReportModal = false;
    this.resetForm();
  }

  resetForm() {
    const today = new Date();
    this.reportDate = today.toISOString().split('T')[0];
    this.hours = 0;
    this.bibleStudiesCount = 0;
    this.joined_ministry = 'yes';
    this.note = '';
    this.isSuccess = false;
    this.alertMessage = '';
  }

  incrementHours() {
    this.hours++;
  }

  decrementHours() {
    if (this.hours > 0) {
      this.hours--;
    }
  }

  incrementBibleStudies() {
    this.bibleStudiesCount++;
  }

  decrementBibleStudies() {
    if (this.bibleStudiesCount > 0) {
      this.bibleStudiesCount--;
    }
  }

  generateManualReport() {
    if (!this.reportDate || !this.hours || !this.joined_ministry) {
      this.isSuccess = false;
      this.alertMessage = 'Please fill in all required fields.';
      return;
    }

    this.isSubmitting = true;

    // Parse the date to get month and year
    const selectedDate = new Date(this.reportDate);
    const monthName = selectedDate.toLocaleDateString('en-US', { month: 'long' });
    const year = selectedDate.getFullYear();

    // Prepare data for PNG generation (exactly matching reports component structure)
    const reportData = {
      month: `${monthName} ${year}`,
      bibleStudies: this.bibleStudiesCount, // Use the manual input count
      is_joined_ministry: this.joined_ministry, // Keep as string 'yes' or 'no'
      hours: this.isPioneer ? this.hours : undefined,
      report_count: 1, // Since it's a manual report
    };

    try {
      // Generate PNG without saving to database
      this.util.generatePNG(reportData, this.isPioneer);

      this.isSuccess = true;
      this.alertMessage = 'Report generated successfully! Check your downloads.';

      setTimeout(() => {
        this.closeManualReportModal();
      }, 1500);
    } catch (error) {
      console.error('Error generating report:', error);
      this.isSuccess = false;
      this.alertMessage = 'Error generating report. Please try again.';
    } finally {
      this.isSubmitting = false;
    }
  }
}
