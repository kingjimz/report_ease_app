import { Component, OnInit } from '@angular/core';
import { ChartComponent } from '../components/chart/chart.component';
import { ApiService } from '../_services/api.service';
import { UtilService } from '../_services/util.service';
import { SettingsService } from '../_services/settings.service';
import { MissionService, PracticeSummary } from '../_services/mission.service';
import { NavigationService } from '../_services/navigation.service';
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

  get greeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  bibleStudies: any[] = [];
  studySelected: any = null;
  isSelected = false;
  studyDelete = false;
  next_lesson = '';
  openDownloadModal = false;
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

  // This-week stats shown in the metrics cards.
  weeklyHours: number = 0;
  dailyAverage: number = 0;

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

  // Today's daily practice summary (verse, progress, streak) for the dashboard card.
  practice: PracticeSummary | null = null;

  constructor(
    public api: ApiService,
    public util: UtilService,
    private settingsService: SettingsService,
    private missionSvc: MissionService,
    private navigationService: NavigationService,
  ) {}

  ngOnInit() {
    // Subscribe to real-time data streams (works offline with Firestore cache)
    this.subscribeToDataStreams();

    // Keep the daily practice summary in sync with completion records.
    this.api.missionCompletions$.subscribe((completions) => {
      this.practice = this.missionSvc.getTodaySummary(completions || []);
    });
    
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
        this.calculateWeeklyHours();
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
          (study) => study.type === 'bs' && !study.completed,
        ).length;
        this.numberOfReturnVisits = this.bibleStudies.filter(
          (study) => study.type === 'rv' && !study.completed,
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

  async loadBibLeStudies() {
    try {
      const data = await this.api.getBibleStudies();
      if (data) {
        this.bibleStudies = data;
        // Don't call updateBibleStudies here - the real-time listener will handle updates
        // Calling it would create a loop since we're also subscribed to bibleStudies$
        this.numberOfBibleStudies = this.bibleStudies.filter(
          (study) => study.type === 'bs' && !study.completed,
        ).length;
        this.numberOfReturnVisits = this.bibleStudies.filter(
          (study) => study.type === 'rv' && !study.completed,
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
        this.calculateWeeklyHours();
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

  // Open the full Daily Practice page (the goals tab defaults to the practice view).
  goToPractice() {
    this.navigationService.changeTab('goals');
  }

  // Open today's practice verse in JW Library (falls back to the website).
  openVerse() {
    this.missionSvc.openVerse(this.practice?.verse);
  }

  // Total number of practices in the rotation (for the "X of Y" label).
  get practiceTotal(): number {
    return this.missionSvc.count;
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
