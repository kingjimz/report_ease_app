import { Component, OnInit } from '@angular/core';
import { ChartComponent } from '../components/chart/chart.component';
import { ApiService } from '../_services/api.service';
import { UtilService } from '../_services/util.service';
import { SettingsService } from '../_services/settings.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [ChartComponent, CommonModule],
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

  constructor(
    public api: ApiService,
    public util: UtilService,
    private settingsService: SettingsService
  ) {}

  ngOnInit() {
    this.loadReports();
    this.loadBibLeStudies();
    this.loadGoals();
    this.calculateServiceYear();
    this.loadUserSettings();
  }

  loadUserSettings() {
    this.settingsService.settings$.subscribe(settings => {
      this.showPioneerSection = settings.isPioneer;
      if (this.showPioneerSection && this.allReports.length > 0) {
        this.calculatePioneerYearHours();
      }
    });
  }

  async loadBibLeStudies() {
    await this.api
      .getBibleStudies()
      .then((data) => {
        this.bibleStudies = data;
        this.api.updateBibleStudies(data);
        this.numberOfBibleStudies = this.bibleStudies.filter(
          (study) => study.type === 'bs',
        ).length;
        this.numberOfReturnVisits = this.bibleStudies.filter(
          (study) => study.type === 'rv',
        ).length;
      })
      .catch((error) => {
        console.error('Error fetching Bible studies:', error);
      });
  }

  async loadReports() {
    await this.api
      .getReports()
      .then((data) => {
        this.allReports = data;
        this.reports = data;
        this.reports = this.util.aggregateReportsByMonth(data);
        this.api.updateAggregatedData(this.reports);
        this.monthlyHours =
          this.reports.length > 0 ? this.reports[0].total_hours || 0 : 0;
        this.prevMonthHours =
          this.reports.length > 1 ? this.reports[1].total_hours || 0 : 0;
        this.calculatePioneerYearHours();
      })
      .catch((error) => {
        console.error('Error fetching reports:', error);
      });
  }

  loadGoals() {
    this.api
      .getGoals()
      .then((goals) => {
        this.goals = goals;
        this.randomizeGoals(this.goals);
        this.api.notifyGoalChange(goals);
      })
      .catch((error) => {
        console.error('Error loading goals:', error);
      });
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

    console.log('Service Year Range:', {
      start: serviceYearStart.toISOString(),
      end: serviceYearEnd.toISOString(),
      currentMonth: currentMonth,
      serviceYearStartYear: serviceYearStartYear
    });

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

    console.log('Total reports:', this.allReports.length);
    console.log('Service year reports:', serviceYearReports.length);
    console.log('Sample report dates:', this.allReports.slice(0, 5).map(r => {
      if (!r.report_date) return 'NO DATE';
      if (r.report_date.toDate) return r.report_date.toDate();
      if (r.report_date.seconds) return new Date(r.report_date.seconds * 1000);
      return r.report_date;
    }));

    // Calculate total hours
    this.pioneerYearHours = serviceYearReports.reduce((total, report) => {
      return total + (report.hours || 0);
    }, 0);

    console.log('Pioneer year hours:', this.pioneerYearHours);

    // Calculate remaining hours and progress
    this.hoursRemaining = Math.max(0, this.pioneerYearGoal - this.pioneerYearHours);
    this.pioneerYearProgress = Math.min(100, (this.pioneerYearHours / this.pioneerYearGoal) * 100);

    // Calculate average monthly hours and projection
    const monthsElapsed = this.getMonthsElapsedInServiceYear();
    this.averageMonthlyHours = monthsElapsed > 0 ? this.pioneerYearHours / monthsElapsed : 0;
    this.projectedTotal = this.averageMonthlyHours * 12;
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
   */
  getRecommendedMonthlyHours(): number {
    const monthsRemaining = this.getMonthsRemaining();
    if (monthsRemaining === 0) return 0;
    return Math.ceil(this.hoursRemaining / monthsRemaining);
  }
}
