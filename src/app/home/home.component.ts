import { Component, HostListener, OnInit, ViewChild, ChangeDetectorRef } from '@angular/core';
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
import { SettingsService } from '../_services/settings.service';
import { TutorialComponent } from '../components/tutorial/tutorial.component';
import { TutorialService } from '../_services/tutorial.service';
import { ModalService } from '../_services/modal.service';
import { NavigationService } from '../_services/navigation.service';

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
    TutorialComponent,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent implements OnInit {
  @ViewChild(ReportsComponent) reportsComponent?: ReportsComponent;
  @ViewChild(DashboardComponent) dashboardComponent?: DashboardComponent;
  @ViewChild(CalendarComponent) calendarComponent?: CalendarComponent;
  
  activeTab = 'dashboard';
  showTab = true;
  selectedTab: string = 'dashboard';
  showManualReportModal = false;
  showOnboardingModal = false;
  showTutorial = false;
  isAnyModalOpen = false;
  forceReportsVisible = false; // Flag to temporarily show reports component for modal

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

  // Onboarding modal
  onboardingPioneerChoice: boolean | null = null;

  constructor(
    private auth: AuthService,
    private route: Router,
    private api: ApiService,
    private util: UtilService,
    private settingsService: SettingsService,
    private tutorialService: TutorialService,
    private modalService: ModalService,
    private navigationService: NavigationService,
    private cdr: ChangeDetectorRef,
  ) {
    // Set default date to today
    const today = new Date();
    this.reportDate = today.toISOString().split('T')[0];

    // Load Bible studies
    this.loadBibleStudies();
  }

  ngOnInit() {
    // Check if onboarding has been completed
    this.checkOnboarding();
    
    // Subscribe to modal state to hide tab bar on mobile when modals are open
    // Use setTimeout to defer the update to the next change detection cycle
    // to avoid ExpressionChangedAfterItHasBeenCheckedError
    this.modalService.modalOpen$.subscribe((isOpen) => {
      setTimeout(() => {
        this.isAnyModalOpen = isOpen;
        // If modal closes and we're not on reports tab, hide reports component again
        if (!isOpen && this.activeTab !== 'reports' && this.forceReportsVisible) {
          this.forceReportsVisible = false;
        }
        this.cdr.markForCheck();
      }, 0);
    });

    // Load persisted tab from localStorage
    const persistedTab = localStorage.getItem('activeTab');
    if (persistedTab) {
      this.activeTab = persistedTab;
      this.selectedTab = persistedTab;
      this.navigationService.changeTab(persistedTab);
    }

    // Subscribe to navigation service for tab changes
    this.navigationService.tabChange$.subscribe((tabId) => {
      this.activeTab = tabId;
      this.selectedTab = tabId;
      // Persist the active tab
      localStorage.setItem('activeTab', tabId);
    });
  }

  checkOnboarding() {
    const onboardingCompleted = localStorage.getItem('onboardingCompleted');
    if (!onboardingCompleted) {
      // Show onboarding modal after a short delay to ensure UI is ready
      setTimeout(() => {
        this.showOnboardingModal = true;
      }, 500);
    } else {
      // If onboarding is completed, check if tutorial should be shown
      this.checkTutorial();
    }
  }

  checkTutorial() {
    // Show tutorial if it hasn't been completed
    if (!this.tutorialService.hasCompletedTutorial()) {
      setTimeout(() => {
        this.showTutorial = true;
      }, 1000); // Show tutorial 1 second after page load
    }
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
        // Scrolling down - hide tab bar, preserve current active tab
        this.showTab = false;
        // Don't change selectedTab, just keep current activeTab
      } else {
        // Scrolling up - show tab bar, keep current active tab
        this.showTab = true;
        // Ensure activeTab matches selectedTab without resetting
        if (this.selectedTab && this.selectedTab !== this.activeTab) {
          this.activeTab = this.selectedTab;
        }
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
    // Reset forceReportsVisible if switching away from goals (unless modal is open)
    if (tabId !== 'goals' && !this.isAnyModalOpen) {
      this.forceReportsVisible = false;
    }
    // Update navigation service and persist
    this.navigationService.changeTab(tabId);
    localStorage.setItem('activeTab', tabId);
  }

  onManualReportModalOpen() {
    this.showManualReportModal = true;
  }
  
  onAddReportModalOpen() {
    // Defer modal opening to next tick to avoid change detection error
    setTimeout(() => {
      let modalOpened = false;
      
      // Open the modal on the current tab without switching tabs
      if (this.activeTab === 'dashboard' && this.dashboardComponent) {
        // Use dashboard's own modal
        this.dashboardComponent.openAddReportModal();
        modalOpened = true;
      } else if (this.activeTab === 'calendar') {
        // Use calendar component's modal
        if (this.calendarComponent) {
          // Set today's date if no date is selected
          if (!this.calendarComponent.selectedDate || !this.calendarComponent.reportDate) {
            const today = new Date();
            this.calendarComponent.selectedDate = today;
            this.calendarComponent.reportDate = today.toISOString().split('T')[0];
            this.calendarComponent.isDateLocked = false; // Allow date change when opened from + button
          }
          this.calendarComponent.openAddReportModal();
          modalOpened = true;
          // Trigger change detection to ensure modal renders
          this.cdr.detectChanges();
        } else {
          // Calendar component not ready yet, wait and retry
          setTimeout(() => {
            if (this.calendarComponent) {
              const today = new Date();
              this.calendarComponent.selectedDate = today;
              this.calendarComponent.reportDate = today.toISOString().split('T')[0];
              this.calendarComponent.isDateLocked = false;
              this.calendarComponent.openAddReportModal();
              this.cdr.detectChanges();
              modalOpened = true;
            } else {
              // Fallback: use reports component
              console.warn('Calendar component not available, using reports component');
              if (this.reportsComponent) {
                this.reportsComponent.openAddReportModal();
                modalOpened = true;
                this.cdr.detectChanges();
              }
            }
          }, 100);
        }
      } else if (this.activeTab === 'goals') {
        // Use reports component modal
        // Temporarily make reports component visible so modal can render
        // (display:none prevents modals from rendering)
        this.forceReportsVisible = true;
        this.cdr.detectChanges();
        
        setTimeout(() => {
          if (this.reportsComponent) {
            this.reportsComponent.openAddReportModal();
            modalOpened = true;
            this.cdr.detectChanges();
            // Keep reports visible while modal is open
            // It will be hidden again when modal closes (handled in closeAddReportModal or via subscription)
          } else {
            // Reports component not ready, revert visibility
            this.forceReportsVisible = false;
            if (this.modalService.isModalOpen()) {
              this.modalService.closeModal();
            }
          }
        }, 50);
      } else if (this.reportsComponent) {
        // Use reports component modal (available even when hidden) - fallback for other tabs
        this.reportsComponent.openAddReportModal();
        modalOpened = true;
        this.cdr.detectChanges();
      }
      
      // If modal still not opened, try fallback after a delay
      if (!modalOpened) {
        setTimeout(() => {
          if (this.activeTab === 'calendar' && this.calendarComponent) {
            const today = new Date();
            this.calendarComponent.selectedDate = today;
            this.calendarComponent.reportDate = today.toISOString().split('T')[0];
            this.calendarComponent.isDateLocked = false;
            this.calendarComponent.openAddReportModal();
            this.cdr.detectChanges();
          } else if (this.activeTab === 'goals' && this.reportsComponent) {
            this.reportsComponent.openAddReportModal();
            this.cdr.markForCheck();
            this.cdr.detectChanges();
            // Verify modal opened and handle scroll lock if needed
            setTimeout(() => {
              if (!this.reportsComponent?.showAddReportModal && this.modalService.isModalOpen()) {
                this.modalService.closeModal();
              }
            }, 150);
          } else if (this.reportsComponent) {
            this.reportsComponent.openAddReportModal();
            this.cdr.detectChanges();
          }
        }, 100);
      }
    }, 0);
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

  // Onboarding modal methods
  selectPioneerStatus(isPioneer: boolean) {
    this.onboardingPioneerChoice = isPioneer;
  }

  completeOnboarding() {
    if (this.onboardingPioneerChoice !== null) {
      // Set pioneer status based on user's choice
      this.settingsService.setIsPioneer(this.onboardingPioneerChoice);
      
      // Mark onboarding as completed
      localStorage.setItem('onboardingCompleted', 'true');
      
      // Close modal
      this.showOnboardingModal = false;
      
      // Show tutorial after onboarding is completed
      setTimeout(() => {
        this.checkTutorial();
      }, 500);
    }
  }

  onTutorialComplete() {
    this.showTutorial = false;
  }

  onTutorialSkip() {
    this.showTutorial = false;
  }
}
