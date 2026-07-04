import { Component, OnDestroy, OnInit } from '@angular/core';
import { ChartComponent } from '../components/chart/chart.component';
import { ApiService } from '../_services/api.service';
import { UtilService } from '../_services/util.service';
import { SettingsService } from '../_services/settings.service';
import { MissionService, PracticeSummary } from '../_services/mission.service';
import { NavigationService } from '../_services/navigation.service';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../components/modal/modal.component';
import { AlertsComponent } from '../components/alerts/alerts.component';
import { WeatherWidgetComponent } from '../components/weather-widget/weather-widget.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [ChartComponent, CommonModule, FormsModule, ModalComponent, AlertsComponent, WeatherWidgetComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit, OnDestroy {
  private subs: Subscription[] = [];
  reports: any[] = [];

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
  upcomingStudies: any[] = [];
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
    this.subs.push(this.api.missionCompletions$.subscribe((completions) => {
      this.practice = this.missionSvc.getTodaySummary(completions || []);
    }));
    
    // Also try to load initial data (will use cache if offline)
    this.loadReports();
    this.loadBibleStudies();
    this.loadGoals();
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
  }

  subscribeToDataStreams() {
    // Subscribe to reports stream (updates in real-time, works offline)
    this.subs.push(this.api.reports$.subscribe((reports) => {
      if (reports && reports.length >= 0) {
        this.allReports = reports;
        this.reports = this.util.aggregateReportsByMonth(reports);
        this.api.updateAggregatedData(this.reports);
        this.computeMonthlyHours();
        this.calculateWeeklyHours();
        this.loading = false;
      }
    }));

    // Subscribe to bible studies stream
    this.subs.push(this.api.bibleStudies$.subscribe((studies) => {
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
        this.computeUpcomingStudies();
        this.loading = false;
      }
    }));

    // Subscribe to goals stream
    this.subs.push(this.api.goals$.subscribe((goals) => {
      if (goals && goals.length >= 0) {
        this.goals = goals;
        this.randomizeGoals(this.goals);
        // Don't call notifyGoalChange here - it would create an infinite loop
        // The data is already coming from the subject
        this.loading = false;
      }
    }));
  }
  
  /**
   * Set the "this month" / "previous month" hour totals by matching the actual
   * current calendar month, not just the latest month that has data. Without
   * this, an empty current month falls back to the most recent month with
   * reports and shows stale totals.
   */
  private computeMonthlyHours() {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    let prevYear = curYear;
    let prevMonth = curMonth - 1;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear -= 1;
    }
    const curEntry = this.reports.find(
      (r) => r.year === curYear && r.month === curMonth,
    );
    const prevEntry = this.reports.find(
      (r) => r.year === prevYear && r.month === prevMonth,
    );
    this.monthlyHours = curEntry?.total_hours || 0;
    this.prevMonthHours = prevEntry?.total_hours || 0;
  }

  calculateWeeklyHours() {
    const now = new Date();
    // Start of the current calendar week (Sunday at midnight)
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

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
      return reportDate >= startOfWeek && reportDate <= now;
    });

    const daysElapsed = now.getDay() + 1;
    this.weeklyHours = weeklyReports.reduce((total, report) => total + (report.hours || 0), 0);
    this.dailyAverage = daysElapsed > 0 ? this.weeklyHours / daysElapsed : 0;
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

  async loadBibleStudies() {
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
        this.computeMonthlyHours();
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

  private computeUpcomingStudies() {
    const active = this.bibleStudies.filter(s => !s.completed && s.schedule);
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const withDates = active
      .map(s => ({ ...s, _scheduleDate: this.parseScheduleDate(s.schedule) }))
      .filter(s => s._scheduleDate !== null)
      .sort((a, b) => {
        const aOverdue = a._scheduleDate!.getTime() < now.getTime();
        const bOverdue = b._scheduleDate!.getTime() < now.getTime();
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
        return a._scheduleDate!.getTime() - b._scheduleDate!.getTime();
      });

    this.upcomingStudies = withDates.slice(0, 5);
  }

  parseScheduleDate(schedule: any): Date | null {
    if (!schedule) return null;
    if (schedule.toDate && typeof schedule.toDate === 'function') return schedule.toDate();
    if (schedule.seconds) return new Date(schedule.seconds * 1000);
    if (schedule instanceof Date) return schedule;
    if (typeof schedule === 'string') {
      const d = new Date(schedule);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  formatSchedule(schedule: any): string {
    const date = this.parseScheduleDate(schedule);
    if (!date) return 'Not scheduled';
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  isOverdue(study: any): boolean {
    const date = this.parseScheduleDate(study.schedule);
    if (!date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const schedDay = new Date(date);
    schedDay.setHours(0, 0, 0, 0);
    return schedDay < today;
  }

  getDaysUntil(study: any): string {
    const date = this.parseScheduleDate(study.schedule);
    if (!date) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const schedDay = new Date(date);
    schedDay.setHours(0, 0, 0, 0);
    const diff = Math.ceil((schedDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return `In ${diff} days`;
  }

  navigateTo(tab: string) {
    this.navigationService.changeTab(tab);
  }

  navigateToStudy(study: any) {
    this.navigationService.navigateToStudies(study.type === 'bs' ? 'bs' : 'rv');
  }

  addNewStudy() {
    this.navigationService.navigateAndAddStudy();
  }

  currentYear = new Date().getFullYear();

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
