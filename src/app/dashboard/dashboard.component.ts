import { Component, OnInit } from '@angular/core';
import { ChartComponent } from '../components/chart/chart.component';
import { ApiService } from '../_services/api.service';
import { UtilService } from '../_services/util.service';
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

  constructor(
    public api: ApiService,
    public util: UtilService,
  ) {}

  ngOnInit() {
    this.loadReports();
    this.loadBibLeStudies();
    this.loadGoals();
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
}
