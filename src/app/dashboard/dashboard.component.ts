import { Component, OnInit } from '@angular/core';
import { ChartComponent } from '../components/chart/chart.component';
import { ApiService } from '../_services/api.service';
import { UtilService } from '../_services/util.service';
import { SettingsService } from '../_services/settings.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../components/modal/modal.component';
import { AlertsComponent } from '../components/alerts/alerts.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [ChartComponent, CommonModule, FormsModule, ModalComponent, AlertsComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  reports: any[] = [];

  bibleStudies: any[] = [];
  studySelected: any = null;
  isSelected = false;
  studyDelete = false;
  next_lesson = '';
  openDownloadModal = false;
  isPioneer = false;
  selectedReport: any = null;
  dropdownOpen = false;
  monthlyReportData: any = null;
  loading = true;
  isCopied = false;
  numberOfBibleStudies = 0;
  numberOfReturnVisits = 0;
  monthlyHours = 0;
  prevMonthHours = 0;
  allReports: any[] = [];
  goals: any[] = [];
  randomizedGoals: any[] = [];
  
  // Pioneer Year Progress (September to August)
  showPioneerSection = false;
  pioneerYearHours = 0;
  pioneerYearGoal = 600;
  pioneerYearProgress = 0;
  hoursRemaining = 600;
  serviceYearStart = '';
  serviceYearEnd = '';
  averageMonthlyHours = 0;
  projectedTotal = 0;
  
  // New properties for enhanced features
  weeklyHours: number = 0;
  dailyAverage: number = 0;
  isOnTrack: boolean = true;
  recommendationMessage: string = '';
  
  // Monthly goal properties
  monthlyGoal: number = 50; // Default monthly goal
  monthlyProgress: number = 0;
  daysRemainingInMonth: number = 0;
  recommendedDailyHours: number = 0;
  
  // Add Report Modal properties
  showAddReportModal: boolean = false;
  reportDate: string = '';
  reportHours: number = 0;
  reportMinutes: number = 0;
  reportJoinedMinistry: string = 'yes';
  reportNotes: string = '';
  isSubmittingReport: boolean = false;
  reportSuccess: boolean = false;
  reportAlertMessage: string = '';

  constructor(
    public api: ApiService,
    public util: UtilService,
    private settingsService: SettingsService
  ) {}

  ngOnInit() {
    this.calculateServiceYear();
    this.loadUserSettings();
    
    // Subscribe to real-time data streams (works offline with Firestore cache)
    this.subscribeToDataStreams();
    
    // Also try to load initial data (will use cache if offline)
    this.loadReports();
    this.loadBibLeStudies();
    this.loadGoals();
  }
  
  subscribeToDataStreams() {
    // Subscribe to reports stream (updates in real-time, works offline)
    this.api.reports$.subscribe((reports) => {
      if (reports && reports.length >= 0) {
        this.allReports = reports;
        this.reports = this.util.aggregateReportsByMonth(reports);
        this.api.updateAggregatedData(this.reports);
        this.monthlyHours =
          this.reports.length > 0 ? this.reports[0].total_hours || 0 : 0;
        this.prevMonthHours =
          this.reports.length > 1 ? this.reports[1].total_hours || 0 : 0;
        this.calculatePioneerYearHours();
        this.calculateWeeklyHours();
        this.calculateMonthlyGoal();
        this.generateRecommendation();
        this.loading = false;
      }
    });
    
    // Subscribe to bible studies stream
    this.api.bibleStudies$.subscribe((studies) => {
      if (studies && studies.length >= 0) {
        this.bibleStudies = studies;
        // Don't call updateBibleStudies here - it would create an infinite loop
        // The data is already coming from the subject
        this.numberOfBibleStudies = this.bibleStudies.filter(
          (study) => study.type === 'bs',
        ).length;
        this.numberOfReturnVisits = this.bibleStudies.filter(
          (study) => study.type === 'rv',
        ).length;
        this.loading = false;
      }
    });
    
    // Subscribe to goals stream
    this.api.goals$.subscribe((goals) => {
      if (goals && goals.length >= 0) {
        this.goals = goals;
        this.randomizeGoals(this.goals);
        // Don't call notifyGoalChange here - it would create an infinite loop
        // The data is already coming from the subject
        this.loading = false;
      }
    });
  }
  
  calculateWeeklyHours() {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const weeklyReports = this.allReports.filter(report => {
      if (!report.report_date) return false;
      let reportDate: Date;
      if (report.report_date.toDate) {
        reportDate = report.report_date.toDate();
      } else if (report.report_date.seconds) {
        reportDate = new Date(report.report_date.seconds * 1000);
      } else {
        reportDate = new Date(report.report_date);
      }
      return reportDate >= weekAgo && reportDate <= now;
    });
    
    this.weeklyHours = weeklyReports.reduce((total, report) => total + (report.hours || 0), 0);
    this.dailyAverage = this.weeklyHours / 7;
  }
  
  calculateMonthlyGoal() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Calculate days remaining in current month
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();
    const currentDay = now.getDate();
    this.daysRemainingInMonth = daysInMonth - currentDay + 1; // Include today
    
    // Set monthly goal based on pioneer status
    if (this.showPioneerSection) {
      // For pioneers, use the calculated recommended monthly hours to reach 600-hour goal
      // This ensures they stay on track for the service year
      const recommendedMonthly = this.getRecommendedMonthlyHours();
      // Use recommended monthly, but ensure it's at least 50 (standard pioneer monthly goal)
      // If they're ahead, it might be less, but we'll show the recommended amount
      this.monthlyGoal = recommendedMonthly > 0 ? recommendedMonthly : 50;
    } else {
      // For regular publishers, encourage 15 hours per month
      this.monthlyGoal = 15;
    }
    
    // Calculate monthly progress percentage
    this.monthlyProgress = this.monthlyGoal > 0 
      ? Math.min(100, (this.monthlyHours / this.monthlyGoal) * 100) 
      : 0;
    
    // Calculate recommended daily hours to meet goal
    if (this.daysRemainingInMonth > 0) {
      const hoursNeeded = Math.max(0, this.monthlyGoal - this.monthlyHours);
      this.recommendedDailyHours = hoursNeeded / this.daysRemainingInMonth;
    } else {
      this.recommendedDailyHours = 0;
    }
  }
  
  getMonthlyGoalStatus(): string {
    if (this.monthlyProgress >= 100) {
      return 'Completed';
    } else if (this.monthlyProgress >= 75) {
      return 'On Track';
    } else if (this.monthlyProgress >= 50) {
      return 'Good Progress';
    } else {
      return 'Needs Focus';
    }
  }
  
  getMonthlyGoalColor(): string {
    if (this.monthlyProgress >= 100) {
      return 'from-green-500 to-emerald-600';
    } else if (this.monthlyProgress >= 75) {
      return 'from-blue-500 to-indigo-600';
    } else if (this.monthlyProgress >= 50) {
      return 'from-amber-500 to-orange-600';
    } else {
      return 'from-orange-500 to-red-600';
    }
  }
  
  generateRecommendation() {
    if (!this.showPioneerSection) {
      this.recommendationMessage = 'Keep up the great work in your ministry!';
      this.isOnTrack = true;
      return;
    }
    
    const monthsRemaining = this.getMonthsRemaining();
    const recommendedMonthly = this.getRecommendedMonthlyHours();
    const currentMonthlyAvg = this.averageMonthlyHours;
    
    if (this.hoursRemaining <= 0) {
      this.recommendationMessage = '🎉 Congratulations! You\'ve reached your yearly goal!';
      this.isOnTrack = true;
    } else if (currentMonthlyAvg >= recommendedMonthly * 0.9) {
      this.recommendationMessage = `Great progress! You're on track to meet your goal.`;
      this.isOnTrack = true;
    } else {
      const hoursNeeded = recommendedMonthly - currentMonthlyAvg;
      this.recommendationMessage = `Aim for ${recommendedMonthly.toFixed(0)} hours/month to stay on track.`;
      this.isOnTrack = false;
    }
  }
  
  getTrendPercentage(): number {
    if (this.prevMonthHours === 0) return 0;
    return ((this.monthlyHours - this.prevMonthHours) / this.prevMonthHours) * 100;
  }
  
  getTrendIcon(): string {
    const trend = this.monthlyHours - this.prevMonthHours;
    if (trend > 0) return 'bi-arrow-up';
    if (trend < 0) return 'bi-arrow-down';
    return 'bi-dash';
  }
  
  getTrendColor(): string {
    const trend = this.monthlyHours - this.prevMonthHours;
    if (trend > 0) return 'text-green-600';
    if (trend < 0) return 'text-red-600';
    return 'text-gray-600';
  }

  loadUserSettings() {
    this.settingsService.settings$.subscribe(settings => {
      this.isPioneer = settings.isPioneer;
      // Show section if user is pioneer (synced with configure modal toggle)
      this.showPioneerSection = settings.isPioneer;
      if (this.showPioneerSection && this.allReports.length > 0) {
        this.calculatePioneerYearHours();
      }
      // Immediately recalculate monthly goal and status when settings change
      this.calculateMonthlyGoal();
      this.generateRecommendation();
    });
  }

  toggleHidePioneerSection() {
    // Toggle pioneer status in settings (this will sync with configure modal)
    const newPioneerStatus = !this.isPioneer;
    this.settingsService.setIsPioneer(newPioneerStatus);
    // Immediately update calculations and status
    this.calculateMonthlyGoal();
    this.generateRecommendation();
    // The loadUserSettings subscription will handle updating showPioneerSection
  }

  async loadBibLeStudies() {
    try {
      const data = await this.api.getBibleStudies();
      if (data) {
        this.bibleStudies = data;
        // Don't call updateBibleStudies here - the real-time listener will handle updates
        // Calling it would create a loop since we're also subscribed to bibleStudies$
        this.numberOfBibleStudies = this.bibleStudies.filter(
          (study) => study.type === 'bs',
        ).length;
        this.numberOfReturnVisits = this.bibleStudies.filter(
          (study) => study.type === 'rv',
        ).length;
      }
      this.loading = false;
    } catch (error) {
      console.error('Error fetching Bible studies:', error);
      this.loading = false; // Still set loading to false even on error
    }
  }

  async loadReports() {
    try {
      const data = await this.api.getReports();
      if (data) {
        this.allReports = data;
        this.reports = data;
        this.reports = this.util.aggregateReportsByMonth(data);
        this.api.updateAggregatedData(this.reports);
        this.monthlyHours =
          this.reports.length > 0 ? this.reports[0].total_hours || 0 : 0;
        this.prevMonthHours =
          this.reports.length > 1 ? this.reports[1].total_hours || 0 : 0;
        this.calculatePioneerYearHours();
        this.calculateWeeklyHours();
        this.calculateMonthlyGoal();
        this.generateRecommendation();
      }
      this.loading = false;
    } catch (error) {
      console.error('Error fetching reports:', error);
      this.loading = false; // Still set loading to false even on error
    }
  }

  async loadGoals() {
    try {
      const goals = await this.api.getGoals();
      if (goals) {
        this.goals = goals;
        this.randomizeGoals(this.goals);
        // Don't call notifyGoalChange here - the real-time listener will handle updates
        // Calling it could create a loop since we're also subscribed to goals$
      }
      this.loading = false;
    } catch (error) {
      console.error('Error loading goals:', error);
      this.loading = false; // Still set loading to false even on error
    }
  }

  shuffle(array: any[]) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, 2);
  }

  randomizeGoals(goals: any[]) {
    this.randomizedGoals = this.shuffle(goals);
  }

  getCurrentDate(): string {
    return new Date().toLocaleDateString();
  }

  /**
   * Calculate the service year dates (September to August)
   */
  calculateServiceYear() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed (0 = January)

    // If current month is September (8) or later, service year started this year
    // Otherwise, it started last year
    const serviceYearStartYear = currentMonth >= 8 ? currentYear : currentYear - 1;
    const serviceYearEndYear = serviceYearStartYear + 1;

    this.serviceYearStart = `September ${serviceYearStartYear}`;
    this.serviceYearEnd = `August ${serviceYearEndYear}`;
  }

  /**
   * Calculate total hours worked in the current service year (Sep - Aug)
   */
  calculatePioneerYearHours() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed (0 = January, 8 = September)

    // Determine service year start
    const serviceYearStartYear = currentMonth >= 8 ? currentYear : currentYear - 1;
    const serviceYearStart = new Date(serviceYearStartYear, 8, 1, 0, 0, 0); // September 1st, 00:00:00
    const serviceYearEnd = new Date(serviceYearStartYear + 1, 8, 0, 23, 59, 59); // August 31st, 23:59:59

    // Filter reports within the service year
    const serviceYearReports = this.allReports.filter(report => {
      if (!report.report_date) return false;
      
      // Handle Firestore Timestamp or string date
      let reportDate: Date;
      if (report.report_date.toDate) {
        // Firestore Timestamp
        reportDate = report.report_date.toDate();
      } else if (report.report_date.seconds) {
        // Firestore Timestamp object
        reportDate = new Date(report.report_date.seconds * 1000);
      } else {
        // String or Date
        reportDate = new Date(report.report_date);
      }
      
      const isInRange = reportDate >= serviceYearStart && reportDate <= serviceYearEnd;
      
      return isInRange;
    });

    // Calculate total hours
    this.pioneerYearHours = serviceYearReports.reduce((total, report) => {
      return total + (report.hours || 0);
    }, 0);

    // Calculate remaining hours and progress
    this.hoursRemaining = Math.max(0, this.pioneerYearGoal - this.pioneerYearHours);
    this.pioneerYearProgress = Math.min(100, (this.pioneerYearHours / this.pioneerYearGoal) * 100);

    // Calculate average monthly hours and projection
    const monthsElapsed = this.getMonthsElapsedInServiceYear();
    this.averageMonthlyHours = monthsElapsed > 0 ? this.pioneerYearHours / monthsElapsed : 0;
    this.projectedTotal = this.averageMonthlyHours * 12;
    
    // Calculate additional metrics (order matters - monthly goal needs hoursRemaining)
    this.calculateWeeklyHours();
    this.calculateMonthlyGoal(); // This uses getRecommendedMonthlyHours() which needs hoursRemaining
    this.generateRecommendation();
  }

  /**
   * Get number of months elapsed in current service year
   */
  getMonthsElapsedInServiceYear(): number {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed

    const serviceYearStartYear = currentMonth >= 8 ? currentYear : currentYear - 1;
    const serviceYearStart = new Date(serviceYearStartYear, 8, 1);

    // Calculate months difference
    const monthsDiff = (now.getFullYear() - serviceYearStart.getFullYear()) * 12 
                      + (now.getMonth() - serviceYearStart.getMonth());
    
    return Math.max(1, monthsDiff + 1); // At least 1 month
  }

  /**
   * Get months remaining in service year
   */
  getMonthsRemaining(): number {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const serviceYearStartYear = currentMonth >= 8 ? currentYear : currentYear - 1;
    const serviceYearEnd = new Date(serviceYearStartYear + 1, 7, 31); // August 31st

    const monthsDiff = (serviceYearEnd.getFullYear() - now.getFullYear()) * 12 
                      + (serviceYearEnd.getMonth() - now.getMonth());
    
    return Math.max(0, monthsDiff + 1);
  }

  /**
   * Get recommended monthly hours to meet goal
   * This calculates how many hours per month are needed for the remaining months
   * to reach the 600-hour pioneer goal by the end of the service year
   */
  getRecommendedMonthlyHours(): number {
    if (!this.showPioneerSection) {
      // For non-pioneers, return standard monthly goal
      return 12;
    }
    
    const monthsRemaining = this.getMonthsRemaining();
    if (monthsRemaining === 0) {
      // Service year ended or no months remaining
      return 0;
    }
    
    // Calculate hours needed per month to reach 600-hour goal
    // This ensures they stay on track for the entire service year
    const recommendedMonthly = Math.ceil(this.hoursRemaining / monthsRemaining);
    
    // Ensure minimum of 50 hours (standard pioneer monthly requirement)
    // But if they're ahead, it might be less
    return Math.max(0, recommendedMonthly);
  }
  
  // Helper method for Math.abs in template
  Math = Math;
  
  // Add Report Modal Methods
  openAddReportModal() {
    // Set default date to today
    const today = new Date();
    this.reportDate = today.toISOString().split('T')[0];
    this.reportHours = 0;
    this.reportMinutes = 0;
    this.reportJoinedMinistry = 'yes';
    this.reportNotes = '';
    this.reportSuccess = false;
    this.reportAlertMessage = '';
    this.showAddReportModal = true;
  }
  
  closeAddReportModal() {
    this.showAddReportModal = false;
    this.reportDate = '';
    this.reportHours = 0;
    this.reportMinutes = 0;
    this.reportJoinedMinistry = 'yes';
    this.reportNotes = '';
    this.reportSuccess = false;
    this.reportAlertMessage = '';
  }
  
  incrementHours() {
    this.reportHours = (this.reportHours || 0) + 1;
  }
  
  decrementHours() {
    this.reportHours = Math.max(0, (this.reportHours || 0) - 1);
  }
  
  incrementMinutes() {
    this.reportMinutes = Math.min(55, (this.reportMinutes || 0) + 5);
  }
  
  decrementMinutes() {
    this.reportMinutes = Math.max(0, (this.reportMinutes || 0) - 5);
  }
  
  openDatePicker(event: Event) {
    const input = event.target as HTMLInputElement;
    // Use showPicker() if available (modern browsers)
    if (input && typeof input.showPicker === 'function') {
      try {
        input.showPicker();
      } catch (error) {
        // Fallback: just focus the input, which will open the picker on most browsers
        input.focus();
        input.click();
      }
    } else {
      // Fallback for older browsers
      input.focus();
      input.click();
    }
  }
  
  async saveReport() {
    if (!this.reportDate) {
      this.reportSuccess = false;
      this.reportAlertMessage = 'Please select a date for the report.';
      return;
    }
    
    if (!this.reportHours && !this.reportMinutes) {
      this.reportSuccess = false;
      this.reportAlertMessage = 'Please enter at least some hours or minutes.';
      return;
    }
    
    if (!this.reportJoinedMinistry) {
      this.reportSuccess = false;
      this.reportAlertMessage = 'Please indicate if you participated in the ministry.';
      return;
    }
    
    this.isSubmittingReport = true;
    
    try {
      // Convert date string to Date object
      const selectedDate = new Date(this.reportDate);
      // Set time to start of day to avoid timezone issues
      selectedDate.setHours(0, 0, 0, 0);
      
      const report = {
        hours: this.reportHours || 0,
        minutes: this.reportMinutes || 0,
        is_joined_ministry: this.reportJoinedMinistry,
        notes: this.reportNotes || '',
        report_date: selectedDate,
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      await this.api.createReport(report);
      
      this.reportSuccess = true;
      this.reportAlertMessage = 'Report added successfully! It will appear on your calendar.';
      
      // Reload reports to update dashboard
      await this.loadReports();
      
      // Close modal after 1.5 seconds
      setTimeout(() => {
        this.closeAddReportModal();
      }, 1500);
    } catch (error) {
      console.error('Error saving report:', error);
      this.reportSuccess = false;
      this.reportAlertMessage = 'Error saving report. Please try again.';
    } finally {
      this.isSubmittingReport = false;
    }
  }
}
