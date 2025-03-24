import { Component, Signal, computed, OnInit } from '@angular/core';
import { ApiService } from '../../_services/api.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UtilService } from '../../_services/util.service';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.css'
})
export class ReportsComponent {
  reports: any[];

  bibleStudies: any[] = []; 
  studySelected: any = null; 
  isSelected = false;
  studyDelete = false;
  next_lesson = '';

  constructor(public api: ApiService, public util: UtilService) { 
    this.reports = this.api.reportSignal(); 
    this.bibleStudies = this.api.bibleStudySignal();
  }

  async loadBibLeStudies() {
    await this.api.getBibleStudies().then(() => {
     // this.bibleStudies = this.api.bibleStudySignal();
     
    }).catch(error => {
      console.error('Error loading bible studies:', error);
    });
  }

  // Computed property to aggregate reports by month
  aggregatedReports = computed(() => {
    const aggregated: { [key: string]: { hours: number; minutes: number; monthYear: string, is_joined_ministry: boolean } } = {};

    this.reports.forEach(report => {
      if (!report.report_date) return;
      
      const date = new Date(report.report_date.seconds * 1000);
      const monthYearKey = `${date.getFullYear()}-${date.getMonth() + 1}`; // e.g., "2025-3"

      if (!aggregated[monthYearKey]) {
        aggregated[monthYearKey] = { hours: 0, minutes: 0, monthYear: this.util.formatDate(report.report_date), is_joined_ministry: report.is_joined_ministry };
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

  filteredReports(): any[] {
    const reports = this.aggregatedReports();
    if (!reports || reports.length === 0) return [];
  
    // Sort reports by date (assuming 'monthYear' is in 'YYYY-MM' format)
    reports.sort((a, b) => new Date(b.monthYear).getTime() - new Date(a.monthYear).getTime());
  
    // Return only the latest two months
    return reports.slice(0, 2);
  }

  editStudy(study: any) {
    this.isSelected = true;
    this.studySelected = study;
    this.next_lesson = study.lesson;
  }

  closeStudyDetails() {
    this.isSelected = false;
    this.studySelected = null;
  }

  deleteStudy(study: any) {
    this.studyDelete = true;
    this.studySelected = study;
  }

  async confirmDelete() {
    this.studyDelete = false;
    if (!this.studySelected?.id) return;

    const study = this.studySelected;
    console.log('Deleting study:', study);
  
    await this.api.deleteStudy(study).then(() => {
      // Filter out the deleted study from the signal directly
      this.loadBibLeStudies();
    }).catch(error => {
      console.error('Error deleting study:', error);
    });
  
    this.closeStudyDetails();
  }
  closeDeleteModal() {
    this.studyDelete = false;
  }

  updateStudy(study: any) {
    this.isSelected = false;
    this.studySelected = null;

    if (this.next_lesson === study.lesson) {
      return;
    }

    const studyData = {
      bible_study: study.bible_study,
      address: study.address,
      schedule: study.schedule,
      type: study.type,
      lesson: this.next_lesson,
      updated_at: new Date(),
      id: study.id
    }

    this.api.updateStudy(studyData).then(() => {
      this.loadBibLeStudies();
    }).catch(error => {
      console.error('Error updating study:', error);
    });

  }
}
