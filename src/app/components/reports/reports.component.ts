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
  loading = true; // Loading state

  constructor(public api: ApiService, public util: UtilService) { }

  ngOnInit() {
    this.loadReports();
    this.loadBibLeStudies();
    setTimeout(() => {
      this.loading = false;
    }, 2000);
  }

  async loadBibLeStudies() {
    await this.api.getBibleStudies().then((data) => {
      this.bibleStudies = data;
    }).catch(error => {
      console.error('Error fetching Bible studies:', error);
    });
  }


  async loadReports() {
    await this.api.getReports().then((data) => {
      this.reports = data;
      this.reports = this.aggregateReportsByMonth(data);
    }).catch(error => {
      console.error('Error fetching reports:', error);
    });
  }

  aggregateReportsByMonth(reports: any[]): any[] {
    const aggregated: Record<string, any> = {};
  
    reports.forEach(report => {
      // Convert Firestore timestamp to Date
      const reportDate = report.report_date instanceof Date 
        ? report.report_date 
        : new Date(report.report_date.seconds * 1000);
      
      // Group by Year-Month (e.g., "2024-04" for April 2024)
      const yearMonth = `${reportDate.getFullYear()}-${String(reportDate.getMonth() + 1).padStart(2, '0')}`;
      const hours = parseInt(report.hours) || 0;
  
      if (!aggregated[yearMonth]) {
        aggregated[yearMonth] = {
          year: reportDate.getFullYear(),
          month: reportDate.getMonth() + 1,
          month_name: reportDate.toLocaleString('default', { month: 'long' }),
          total_hours: 0,
          report_count: 0,
          is_joined_ministry: "no", // Default to "no" unless a "yes" is found
          reports: []
        };
      }
  
      aggregated[yearMonth].total_hours += hours;
      aggregated[yearMonth].report_count++;
      aggregated[yearMonth].reports.push(report);
  
      // Update is_joined_ministry if any report says "yes"
      if (report.is_joined_ministry?.toLowerCase() === "yes") {
        aggregated[yearMonth].is_joined_ministry = "yes";
      }
    });
  
    // Sort by year-month (newest first)
    return Object.values(aggregated).sort((a, b) => 
      b.year - a.year || b.month - a.month
    );
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
      month: `${report.month_name} ${report.year}`, // Format: "April 2024"
      bibleStudies: this.filterBibleStudies(this.bibleStudies).length,
      is_joined_ministry: report.is_joined_ministry,
      hours: isPioneer ? report.total_hours : undefined, // Use total_hours from aggregation
      report_count: report.report_count // Optional: Include count of reports
    };
  
    this.dropdownOpen = false;
    this.generatePNG(this.monthlyReportData, isPioneer);
  }
  
  filterBibleStudies(studies: any[]): any[] {
    return studies.filter(study => study.type !== 'rv');
  }
  
  generatePNG(report: any, isPioneer: boolean) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;
    
    // Increased canvas height to accommodate additional info
    canvas.width = 400;
    canvas.height = 250;
    
    // Background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Text styling
    ctx.fillStyle = 'black';
    ctx.font = 'bold 22px Arial';
    
    // Header
    const centerX = canvas.width / 2;
    ctx.textAlign = 'center';
    ctx.fillText(`Monthly Report - ${report.month}`, centerX, 30);
    
    // Report details
    ctx.font = '18px Arial';
    ctx.textAlign = 'left';
    let yPosition = 70;
    
    if (report.hours !== undefined) {
      ctx.fillText(`Hours: ${report.hours}`, 20, yPosition);
      yPosition += 30;
    }
    
    ctx.fillText(`Bible Studies: ${report.bibleStudies}`, 20, yPosition);
    yPosition += 30;
    
    ctx.fillText(`Participated in Ministry: ${this.util.capitalizeFirstLetter(report.is_joined_ministry)}`, 20, yPosition);
    yPosition += 30;
  
    
    // Footer line and credit
    ctx.beginPath();
    ctx.moveTo(20, yPosition);
    ctx.lineTo(canvas.width - 20, yPosition);
    ctx.strokeStyle = 'black';
    ctx.stroke();
    
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Generated by Field Service Tracker', centerX, yPosition + 20);
    
    // Download the Image
    const image = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = image;
    link.download = `${isPioneer ? 'Pioneer' : 'Publisher'}-report-${report.month.replace(' ', '-')}.png`;
    link.click();
  }
  
  // Existing helper methods remain the same
  closeDlModal() {
    this.openDownloadModal = false;
  }
  
  toggleDropdown() {
    this.dropdownOpen = !this.dropdownOpen;
  }
}