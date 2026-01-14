import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../_services/auth.service';
import { SettingsService } from '../../_services/settings.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';
import { ModalService } from '../../_services/modal.service';
import { ApiService } from '../../_services/api.service';
import { UtilService } from '../../_services/util.service';
import { NavigationService } from '../../_services/navigation.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule, ThemeToggleComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css',
})
export class HeaderComponent implements OnInit, OnDestroy {
  dropdownOpen = false;
  notificationDropdownOpen = false;
  userData: any;
  showConfigureModal = false;
  isPioneer = false;
  showSuccessMessage = false;
  successMessage = '';
  bibleStudies: any[] = [];
  overdueStudies: any[] = [];
  reports: any[] = [];
  showReportReminder = false;
  currentMonthName = '';
  private bibleStudiesSubscription?: Subscription;
  private reportsSubscription?: Subscription;

  constructor(
    private authService: AuthService,
    private router: Router,
    private settingsService: SettingsService,
    private modalService: ModalService,
    private api: ApiService,
    private util: UtilService,
    private navigationService: NavigationService,
  ) {
    this.authService.user$.subscribe((user) => {
      this.userData = user;
    });
  }

  ngOnInit() {
    this.loadSettings();
    this.loadBibleStudies();
    this.loadReports();
    this.checkReportReminder();
  }

  loadSettings() {
    this.settingsService.settings$.subscribe(settings => {
      this.isPioneer = settings.isPioneer;
    });
  }

  loadBibleStudies() {
    this.bibleStudiesSubscription = this.api.bibleStudies$.subscribe((studies) => {
      if (studies && studies.length > 0) {
        this.bibleStudies = studies;
        this.checkOverdueStudies();
      } else {
        this.bibleStudies = [];
        this.overdueStudies = [];
      }
    });
  }

  loadReports() {
    this.reportsSubscription = this.api.reports$.subscribe((reports) => {
      this.reports = reports || [];
      this.checkReportReminder();
    });
  }

  checkReportReminder() {
    const now = new Date();
    const currentDay = now.getDate();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Get the last day of the current month
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    
    // Show reminder from 25th to last day of month
    // Hide reminder from 1st to 24th
    if (currentDay >= 25 && currentDay <= lastDayOfMonth) {
      // Check if monthly report has been submitted for current month
      const hasMonthlyReport = this.hasMonthlyReportSubmitted(currentMonth, currentYear);
      this.showReportReminder = !hasMonthlyReport;
      
      // Set current month name for display
      this.currentMonthName = now.toLocaleString('default', { month: 'long' });
    } else {
      this.showReportReminder = false;
    }
  }

  hasMonthlyReportSubmitted(month: number, year: number): boolean {
    // Check if any report exists for the current month
    return this.reports.some((report) => {
      if (!report.report_date) return false;
      
      let reportDate: Date;
      if (report.report_date.toDate && typeof report.report_date.toDate === 'function') {
        reportDate = report.report_date.toDate();
      } else if (report.report_date.seconds) {
        reportDate = new Date(report.report_date.seconds * 1000);
      } else if (report.report_date instanceof Date) {
        reportDate = report.report_date;
      } else {
        reportDate = new Date(report.report_date);
      }
      
      return reportDate.getMonth() === month && reportDate.getFullYear() === year;
    });
  }

  checkOverdueStudies() {
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Set to start of day for comparison

    this.overdueStudies = this.bibleStudies.filter((study) => {
      if (!study.schedule) return false;

      let scheduleDate: Date | null = null;

      // Handle different date formats
      if (study.schedule instanceof Date) {
        scheduleDate = study.schedule;
      } else if (study.schedule.toDate && typeof study.schedule.toDate === 'function') {
        scheduleDate = study.schedule.toDate();
      } else if (study.schedule.seconds) {
        scheduleDate = new Date(study.schedule.seconds * 1000);
      } else if (typeof study.schedule === 'string') {
        scheduleDate = new Date(study.schedule);
      }

      if (!scheduleDate || isNaN(scheduleDate.getTime())) {
        return false;
      }

      // Set to start of day for comparison
      scheduleDate.setHours(0, 0, 0, 0);

      // Check if scheduled date has passed
      return scheduleDate < now;
    });
  }

  getNotificationCount(): number {
    let count = this.overdueStudies.length;
    if (this.showReportReminder) {
      count += 1;
    }
    return count;
  }

  toggleNotificationDropdown(event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.notificationDropdownOpen = !this.notificationDropdownOpen;
    // Close profile dropdown if opening notification dropdown
    if (this.notificationDropdownOpen) {
      this.dropdownOpen = false;
    }
  }

  closeNotificationDropdown() {
    this.notificationDropdownOpen = false;
  }

  formatScheduleDate(schedule: any): string {
    if (!schedule) return 'Not scheduled';

    let scheduleDate: Date | null = null;

    if (schedule instanceof Date) {
      scheduleDate = schedule;
    } else if (schedule.toDate && typeof schedule.toDate === 'function') {
      scheduleDate = schedule.toDate();
    } else if (schedule.seconds) {
      scheduleDate = new Date(schedule.seconds * 1000);
    } else if (typeof schedule === 'string') {
      scheduleDate = new Date(schedule);
    }

    if (!scheduleDate || isNaN(scheduleDate.getTime())) {
      return 'Invalid date';
    }

    return scheduleDate.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  calculateDaysOverdue(schedule: any): number {
    if (!schedule) return 0;

    let scheduleDate: Date | null = null;

    if (schedule instanceof Date) {
      scheduleDate = schedule;
    } else if (schedule.toDate && typeof schedule.toDate === 'function') {
      scheduleDate = schedule.toDate();
    } else if (schedule.seconds) {
      scheduleDate = new Date(schedule.seconds * 1000);
    } else if (typeof schedule === 'string') {
      scheduleDate = new Date(schedule);
    }

    if (!scheduleDate || isNaN(scheduleDate.getTime())) {
      return 0;
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    scheduleDate.setHours(0, 0, 0, 0);

    const diffTime = now.getTime() - scheduleDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    return Math.max(0, diffDays);
  }

  navigateToReports() {
    this.closeNotificationDropdown();
    // Update navigation service immediately for instant UI update
    this.navigationService.changeTab('reports');
    // Use setTimeout to ensure UI updates before navigation
    setTimeout(() => {
      // Navigate to home if not already there
      if (this.router.url !== '/') {
        this.router.navigate(['/']);
      }
    }, 0);
  }

  navigateToDashboard() {
    this.closeNotificationDropdown();
    this.navigationService.changeTab('dashboard');
    // Navigate to home if not already there
    if (this.router.url !== '/') {
      this.router.navigate(['/']);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    // Close notification dropdown if clicking outside
    if (this.notificationDropdownOpen && !target.closest('.notification-container')) {
      this.closeNotificationDropdown();
    }
    // Close profile dropdown if clicking outside
    if (this.dropdownOpen && !target.closest('.profile-dropdown-container')) {
      this.dropdownOpen = false;
    }
  }

  toggleDropdown() {
    this.dropdownOpen = !this.dropdownOpen;
    // Close notification dropdown if opening profile dropdown
    if (this.dropdownOpen) {
      this.notificationDropdownOpen = false;
    }
  }

  signOut() {
    this.authService.logout();
  }

  openConfigureModal() {
    this.showConfigureModal = true;
    this.dropdownOpen = false;
    this.modalService.openModal();
  }

  closeConfigureModal() {
    this.showConfigureModal = false;
    this.showSuccessMessage = false;
    this.modalService.closeModal();
  }

  ngOnDestroy(): void {
    if (this.showConfigureModal) {
      this.modalService.closeModal();
    }
    if (this.bibleStudiesSubscription) {
      this.bibleStudiesSubscription.unsubscribe();
    }
    if (this.reportsSubscription) {
      this.reportsSubscription.unsubscribe();
    }
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
