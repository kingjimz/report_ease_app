import { Component, Signal, computed, OnInit } from '@angular/core';
import { ApiService } from '../../_services/api.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UtilService } from '../../_services/util.service';
import { ModalComponent } from '../modal/modal.component';
import { BibleStudiesComponent } from '../bible-studies/bible-studies.component';
import { LoaderComponent } from '../loader/loader.component';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent, BibleStudiesComponent, LoaderComponent],
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
  loading = true; 
  isCopied = false;
  numberOfBibleStudies = 0;
  numberOfReturnVisits = 0;
  hoveredReport: number | null = null;

  constructor(public api: ApiService, public util: UtilService) { }

  ngOnInit() {
    this.loadReports();
    this.loadBibLeStudies();
    setTimeout(() => {
      this.loading = false;
    }, 1000);
  }

  async loadBibLeStudies() {
    this.api.bibleStudies$.subscribe((data) => {
      if (data && data.length > 0) {
        this.bibleStudies = data;
        this.numberOfBibleStudies = this.bibleStudies.filter(study => study.type === 'bs').length;
        this.numberOfReturnVisits = this.bibleStudies.filter(study => study.type === 'rv').length;
      }
    });
  }


  loadReports() {
   this.api.aggregatedData$.subscribe((data) => {
    if (data && data.length > 0) {
      this.reports = data;
    }
  });
}

  editStudy(study: any) {
    this.isSelected = true;
    this.studySelected = study;
    this.next_lesson = study.lesson;
  }

  closeStudyDetails() {
    this.isSelected = false;
    this.studySelected = null;
    this.isCopied = false;
  }

  deleteStudy(study: any) {
    this.studyDelete = true;
    this.studySelected = study;
    this.isCopied = false;
  }

  async confirmDelete() {
    this.studyDelete = false;
    this.isCopied = false;
    if (!this.studySelected?.id) return;

    const study = this.studySelected;
  
    await this.api.deleteStudy(study).then(() => {
      this.closeStudyDetails();
      this.refreshBibleStudies();
    }).catch(error => {
      console.error('Error deleting study:', error);
    });
  }

  refreshBibleStudies() {
    this.api.getBibleStudies().then((data) => {
      this.bibleStudies = data;
      this.api.updateBibleStudies(data);
    }).catch(error => {
      console.error('Error refreshing Bible studies:', error);
    });
  }

  closeDeleteModal() {
    this.studyDelete = false;
    this.isCopied = false;
  }

  updateStudy(study: any) {
    this.isSelected = false;
    this.studySelected = null;
    this.isCopied = false;

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
    this.isCopied = false;
  }
  
  toggleDropdown() {
    this.dropdownOpen = !this.dropdownOpen;
  }

  copyToClipboard(): void {
    if (!this.next_lesson) return;
    
    navigator.clipboard.writeText(this.next_lesson)
      .then(() => {
        this.isCopied = true;
        console.log('Text copied to clipboard');
      })
      .catch(err => {
        this.isCopied = false;
        console.error('Failed to copy text: ', err);
      });
  }

    getReportCardClasses(index: number): string {
    const baseClasses = 'group relative bg-white shadow-xl rounded-2xl border border-gray-200 transition-all duration-500 ease-out hover:shadow-2xl hover:-translate-y-2 hover:scale-[1.01] overflow-hidden';
    const borderColor = this.getReportBorderColor(index);
    const ringClass = this.hoveredReport === index ? 'ring-2 ring-purple-200 ring-opacity-60' : '';
    
    return `${baseClasses} ${borderColor} ${ringClass}`;
  }

  getReportGradientOverlayClasses(index: number): string {
    const gradient = this.getReportGradientColor(index);
    return `absolute top-0 right-0 w-40 h-40 bg-gradient-to-br ${gradient} opacity-5 rounded-bl-full transform translate-x-20 -translate-y-20 group-hover:scale-125 transition-transform duration-700`;
  }

  getMonthIconClasses(index: number): string {
    const gradient = this.getReportGradientColor(index);
    return `bg-gradient-to-br ${gradient} text-white rounded-xl p-4 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:rotate-6`;
  }

  getMinistryIconClasses(isParticipated: boolean): string {
    if (isParticipated) {
      return 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-xl p-3 shadow-lg';
    } else {
      return 'bg-gradient-to-br from-red-500 to-orange-600 text-white rounded-xl p-3 shadow-lg';
    }
  }

  getReportRippleClasses(index: number): string {
    const gradient = this.getReportGradientColor(index);
    return `absolute inset-0 bg-gradient-to-r ${gradient} opacity-0 group-hover:opacity-[0.03] transition-opacity duration-300 rounded-2xl`;
  }

  getProgressWidth(hours: number): number {
    // Assuming 70 hours is the maximum goal, adjust as needed
    const maxHours = 70;
    return Math.min((hours / maxHours) * 100, 100);
  }

  private getReportGradientColor(index: number): string {
    const gradients = [
      'from-purple-500 to-pink-600',
      'from-blue-500 to-indigo-600',
      'from-emerald-500 to-cyan-600',
      'from-orange-500 to-red-600'
    ];
    return gradients[index % gradients.length];
  }

  private getReportBorderColor(index: number): string {
    const colors = [
      'border-l-4 border-purple-500',
      'border-l-4 border-blue-500',
      'border-l-4 border-emerald-500',
      'border-l-4 border-orange-500'
    ];
    return colors[index % colors.length];
  }
}