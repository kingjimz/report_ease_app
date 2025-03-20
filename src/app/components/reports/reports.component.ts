import { Component, Signal, computed } from '@angular/core';
import { ApiService } from '../../_services/api.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.css'
})
export class ReportsComponent {
  reports: any[]; // Raw reports data

  bibleStudies: any[] = []; // Raw bible studies data
  studySelected: any = null; // Selected bible study
  isSelected = false;

  constructor(public api: ApiService) {
    this.reports = this.api.reportSignal(); 
    this.bibleStudies = this.api.bibleStudySignal();
  }

  // Computed property to aggregate reports by month
  aggregatedReports = computed(() => {
    const aggregated: { [key: string]: { hours: number; minutes: number; monthYear: string, is_joined_ministry: boolean } } = {};

    this.reports.forEach(report => {
      if (!report.report_date) return;
      
      const date = new Date(report.report_date.seconds * 1000);
      const monthYearKey = `${date.getFullYear()}-${date.getMonth() + 1}`; // e.g., "2025-3"

      if (!aggregated[monthYearKey]) {
        aggregated[monthYearKey] = { hours: 0, minutes: 0, monthYear: this.formatDate(report.report_date), is_joined_ministry: report.is_joined_ministry };
      }

      aggregated[monthYearKey].hours += parseInt(report.hours, 10) || 0;
      aggregated[monthYearKey].minutes += parseInt(report.minutes, 10) || 0;
    });

    Object.values(aggregated).forEach(entry => {
      entry.hours += Math.floor(entry.minutes / 60);
      entry.minutes = entry.minutes % 60;
    });

    return Object.values(aggregated); 
  });

  formatDate(timestamp: { seconds: number; nanoseconds: number }): string {
    if (!timestamp || !timestamp.seconds) return 'Invalid Date';
    const date = new Date(timestamp.seconds * 1000);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }); // e.g., "March 2025"
  }

  filteredReports(): any[] {
    const reports = this.aggregatedReports();
    if (!reports || reports.length === 0) return [];
  
    // Sort reports by date (assuming 'monthYear' is in 'YYYY-MM' format)
    reports.sort((a, b) => new Date(b.monthYear).getTime() - new Date(a.monthYear).getTime());
  
    // Return only the latest two months
    return reports.slice(0, 2);
  }

  formatDateTime(schedule: string): string {
    const date = new Date(schedule);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true });
  }

  editStudy(study: any) {
    this.isSelected = true;
    this.studySelected = study;
  }

  closeStudyDetails() {
    this.isSelected = false;
    this.studySelected = null;
  }

  
}
