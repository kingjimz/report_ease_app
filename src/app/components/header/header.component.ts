import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../_services/auth.service';
import { SettingsService } from '../../_services/settings.service';
import { ThemeService } from '../../services/theme.service';
import { SwUpdateService } from '../../_services/sw-update.service';
import { ModalService } from '../../_services/modal.service';
import { ApiService } from '../../_services/api.service';
import { UtilService } from '../../_services/util.service';
import { NavigationService } from '../../_services/navigation.service';
import { NotificationService } from '../../_services/notification.service';
import { VersionService } from '../../_services/version.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
  
  // Notification settings
  notificationsEnabled = false;
  notificationPermission = 'default';
  isRequestingPermission = false;
  
  // Theme settings
  isDarkMode = false;
  private themeSubscription?: Subscription;
  
  // Update settings
  isCheckingUpdate = false;
  updateAvailable = false;
  isUpdateEnabled = false;
  currentAppVersion = '1.0.0';

  constructor(
    private authService: AuthService,
    private router: Router,
    private settingsService: SettingsService,
    private themeService: ThemeService,
    private swUpdateService: SwUpdateService,
    private modalService: ModalService,
    private api: ApiService,
    private util: UtilService,
    private navigationService: NavigationService,
    private notificationService: NotificationService,
    private versionService: VersionService,
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
    this.updateNotificationStatus();
    this.checkUpdateStatus();
    
    // Subscribe to theme changes
    this.themeSubscription = this.themeService.darkMode$.subscribe(isDark => {
      this.isDarkMode = isDark;
    });
    
    // Subscribe to permission changes
    this.notificationService.permission$.subscribe(permission => {
      if (permission.granted) {
        this.notificationPermission = 'granted';
      } else if (permission.denied) {
        this.notificationPermission = 'denied';
      } else {
        this.notificationPermission = 'default';
      }
      this.updateNotificationStatus();
    });
    
    // Subscribe to update availability
    if (this.swUpdateService.isEnabled()) {
      this.swUpdateService.updateAvailable$.subscribe(() => {
        this.updateAvailable = true;
      });
      
      // Also subscribe to update status changes (for iOS version service)
      this.swUpdateService.updateAvailableStatus$.subscribe((hasUpdate) => {
        this.updateAvailable = hasUpdate;
      });
    }
  }

  updateNotificationStatus() {
    this.notificationsEnabled = this.notificationService.isNotificationEnabled();
    if ('Notification' in window) {
      this.notificationPermission = Notification.permission;
    }
  }

  async toggleNotifications() {
    if (this.notificationsEnabled) {
      // Disable notifications
      this.notificationService.disableNotifications();
      this.notificationsEnabled = false;
      this.showSuccessMessage = true;
      this.successMessage = 'Notifications disabled';
      setTimeout(() => {
        this.showSuccessMessage = false;
      }, 3000);
    } else {
      // Enable notifications - check permission first
      if (!('Notification' in window)) {
        alert('This browser does not support notifications');
        return;
      }

      if (Notification.permission === 'denied') {
        alert('Notifications are blocked. Please enable them in your browser settings:\n\nChrome/Edge: Settings > Privacy and security > Site settings > Notifications\n\nFirefox: Settings > Privacy & Security > Permissions > Notifications\n\nSafari: Preferences > Websites > Notifications');
        return;
      }

      if (Notification.permission === 'default') {
        // Request permission
        this.isRequestingPermission = true;
        try {
          const granted = await this.notificationService.requestPermission();
          if (granted) {
            this.notificationsEnabled = true;
            this.notificationPermission = 'granted';
            this.showSuccessMessage = true;
            this.successMessage = 'Notifications enabled!';
            setTimeout(() => {
              this.showSuccessMessage = false;
            }, 3000);
          } else {
            this.notificationsEnabled = false;
            this.notificationPermission = Notification.permission;
          }
        } catch (error) {
          console.error('Error requesting notification permission:', error);
          this.notificationsEnabled = false;
        } finally {
          this.isRequestingPermission = false;
        }
      } else if (Notification.permission === 'granted') {
        // Permission already granted, just enable
        this.notificationService.enableNotifications();
        this.notificationsEnabled = true;
        this.showSuccessMessage = true;
        this.successMessage = 'Notifications enabled!';
        setTimeout(() => {
          this.showSuccessMessage = false;
        }, 3000);
      }
    }
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

  togglePioneerStatus() {
    this.settingsService.setIsPioneer(this.isPioneer);
    this.showSuccessMessage = true;
    this.successMessage = `Pioneer status ${this.isPioneer ? 'enabled' : 'disabled'}. Dashboard updated!`;
    
    setTimeout(() => {
      this.showSuccessMessage = false;
    }, 3000);
  }

  toggleTheme() {
    // Get the current state before toggling
    const wasDark = this.isDarkMode;
    this.themeService.toggleTheme();
    // The new state is the opposite of the old state
    this.showSuccessMessage = true;
    this.successMessage = `Theme switched to ${!wasDark ? 'dark' : 'light'} mode`;
    
    setTimeout(() => {
      this.showSuccessMessage = false;
    }, 3000);
  }

  async checkUpdateStatus() {
    this.isUpdateEnabled = this.swUpdateService.isEnabled();
    
    // For iOS, check version to ensure state is accurate after reload
    if (this.swUpdateService.isIOSDevice()) {
      // Wait for version check to complete to get accurate update status
      const hasUpdate = await this.swUpdateService.checkForUpdates();
      this.updateAvailable = hasUpdate;
    } else {
      this.updateAvailable = this.swUpdateService.isUpdateAvailable();
    }
    
    // Update app version display
    this.updateAppVersion();
  }

  async updateAppVersion() {
    // Fetch version from version.json to ensure we have the latest
    try {
      const response = await fetch('/version.json?t=' + Date.now(), {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        const version = data.version || data.appVersion || '1.0.0';
        this.currentAppVersion = version;
        // Also update the version service
        this.versionService.setCurrentVersion(version);
      } else {
        // Fallback to version service value
        this.currentAppVersion = this.versionService.getCurrentAppVersion();
      }
    } catch (error) {
      // Fallback to version service value
      this.currentAppVersion = this.versionService.getCurrentAppVersion();
    }
  }

  async checkForUpdates() {
    if (!this.isUpdateEnabled) {
      this.showSuccessMessage = true;
      this.successMessage = 'Updates are not available on this device';
      setTimeout(() => {
        this.showSuccessMessage = false;
      }, 3000);
      return;
    }

    this.isCheckingUpdate = true;
    try {
      const hasUpdate = await this.swUpdateService.checkForUpdates();
      this.updateAvailable = hasUpdate || this.swUpdateService.isUpdateAvailable();
      
      this.showSuccessMessage = true;
      if (this.updateAvailable) {
        this.successMessage = 'Update available! The app will reload to install it.';
        // Automatically activate update if available
        setTimeout(async () => {
          await this.installUpdate();
        }, 1500);
      } else {
        this.successMessage = 'You are using the latest version';
      }
      
      setTimeout(() => {
        this.showSuccessMessage = false;
      }, 3000);
    } catch (error) {
      console.error('Error checking for updates:', error);
      this.showSuccessMessage = true;
      this.successMessage = 'Failed to check for updates. Please try again later.';
      setTimeout(() => {
        this.showSuccessMessage = false;
      }, 3000);
    } finally {
      this.isCheckingUpdate = false;
    }
  }

  async installUpdate() {
    if (!this.updateAvailable) {
      return;
    }

    try {
      // Clear the update available flag before activating (will be set again if still needed after reload)
      this.updateAvailable = false;
      await this.swUpdateService.activateUpdate();
      // Page will reload automatically after activation
    } catch (error) {
      console.error('Error installing update:', error);
      this.showSuccessMessage = true;
      this.successMessage = 'Failed to install update. Please refresh the page manually.';
      setTimeout(() => {
        this.showSuccessMessage = false;
      }, 3000);
    }
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
    if (this.themeSubscription) {
      this.themeSubscription.unsubscribe();
    }
  }
}
