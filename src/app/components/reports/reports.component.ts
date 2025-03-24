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
  openDownloadModal = false;
  isPioneer = false;
  selectedReport: any = null;
  dropdownOpen = false;
  monthlyReportData: any = null;

  constructor(public api: ApiService, public util: UtilService) { 
    this.reports = this.api.reportSignal(); 
    this.bibleStudies = this.api.bibleStudySignal();
    this.loadBibLeStudies();
  }

  async loadBibLeStudies() {
    await this.api.getBibleStudies().then(() => {
     // this.bibleStudies = this.api.bibleStudySignal() 
    }).catch(error => {
      console.error('Error loading bible studies:', error);
    });
  }

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
  
    await this.api.deleteStudy(study).then(() => {
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

  downloadReport(report: any, isPioneer: boolean) {
    this.selectedReport = report;
    this.monthlyReportData = {
      month: report.monthYear,
      bibleStudies: this.filterBibleStudies(this.bibleStudies).length,
      is_joined_ministry: report.is_joined_ministry,
      hours: isPioneer ? report.hours : undefined
    };

    this.dropdownOpen = false;
    this.generatePNG(this.monthlyReportData, isPioneer);
  }

  filterBibleStudies(studies: any[]): any[] {
    return studies.filter(study => study.type !== 'rv');
  }

  closeDlModal(){
    this.openDownloadModal = false;
  }

  toggleDropdown() {
    this.dropdownOpen = !this.dropdownOpen;
  }

  generatePNG(report:any, isPioneer: boolean) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
  
    if (!ctx) return;
  
    canvas.width = 400;
    canvas.height = 200;
  
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  
    ctx.fillStyle = 'black';
    ctx.font = '20px Arial';
  
    // Example Data
    const data = this.monthlyReportData;

    // Draw Text
    const centerX = canvas.width / 2;
    ctx.textAlign = 'center';

    ctx.fillText(`Month: ${data.month}`, centerX, 30);
    ctx.textAlign = 'left';
    if (data.hours !== undefined) {
      ctx.fillText(`Hours: ${data.hours}`, 10, 60);
    }
    ctx.fillText(`Bible Studies: ${data.bibleStudies}`, 10, data.hours !== undefined ? 90 : 60);
    ctx.fillText(`Participated in Ministry: ${this.util.capitalizeFirstLetter(data.is_joined_ministry)}`, 10, data.hours !== undefined ? 120 : 90);
    
    // Draw horizontal line
    ctx.beginPath();
    ctx.moveTo(10, 140);
    ctx.lineTo(canvas.width - 10, 140);
    ctx.strokeStyle = 'black';
    ctx.stroke();

    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Made with Field Service Tracker', centerX, 160);

  
    // Convert to PNG
    const image = canvas.toDataURL('image/png');
  
    // Download the Image
    const link = document.createElement('a');
    link.href = image;
    link.download = `${isPioneer ? 'Pioneer' : 'Publisher'}-report-${data.month}.png`;
    link.click();
  }
}

