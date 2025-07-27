import { Component, Signal, computed, OnInit } from '@angular/core';
import { ApiService } from '../../_services/api.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UtilService } from '../../_services/util.service';
import { ModalComponent } from '../modal/modal.component';
import { LoaderComponent } from '../loader/loader.component';
import { AlertsComponent } from '../alerts/alerts.component';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ModalComponent,
    LoaderComponent,
    AlertsComponent,
  ],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.css',
})
export class ReportsComponent {
  reports: any[] = [];
  paginatedReports: any[] = [];

  bibleStudies: any[] = [];
  studySelected: any = null;
  isSelected = false;
  studyDelete = false;
  next_lesson = '';
  editSchedule = ''; // Add property for editing schedule
  openDownloadModal = false;
  isPioneer = false;
  selectedReport: any = null;
  dropdownOpen: { [key: number]: boolean } = {};
  monthlyReportData: any = null;
  loading = true;
  isCopied = false;
  numberOfBibleStudies = 0;
  numberOfReturnVisits = 0;
  hoveredReport: number | null = null;

  // Add Study properties
  showStudyModal = false;
  bible_study = '';
  address = '';
  schedule = '';
  type = 'rv';
  isSuccess = false;
  alertMessage = 'Warning: Please verify your input carefully.';

  // Pagination properties
  currentPage = 1;
  itemsPerPage = 5;
  totalPages = 0;

  constructor(
    public api: ApiService,
    public util: UtilService,
  ) {}

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
        this.numberOfBibleStudies = this.bibleStudies.filter(
          (study) => study.type === 'bs',
        ).length;
        this.numberOfReturnVisits = this.bibleStudies.filter(
          (study) => study.type === 'rv',
        ).length;
      }
    });
  }

  loadReports() {
    this.api.aggregatedData$.subscribe((data) => {
      if (data && data.length > 0) {
        this.reports = data;
        this.calculatePagination();
        this.updatePaginatedReports();
      }
    });
  }

  calculatePagination() {
    this.totalPages = Math.ceil(this.reports.length / this.itemsPerPage);
    if (this.currentPage > this.totalPages) {
      this.currentPage = 1;
    }
  }

  updatePaginatedReports() {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    this.paginatedReports = this.reports.slice(startIndex, endIndex);
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.updatePaginatedReports();
    }
  }

  previousPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updatePaginatedReports();
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePaginatedReports();
    }
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(this.totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  }

  editStudy(study: any) {
    this.isSelected = true;
    this.studySelected = study;
    this.next_lesson = study.lesson;
    this.editSchedule = study.schedule; // Initialize with current schedule
  }

  closeStudyDetails() {
    this.isSelected = false;
    this.studySelected = null;
    this.isCopied = false;
    this.editSchedule = ''; // Reset schedule
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

    await this.api
      .deleteStudy(study)
      .then(() => {
        this.closeStudyDetails();
        this.refreshBibleStudies();
      })
      .catch((error) => {
        console.error('Error deleting study:', error);
      });
  }

  refreshBibleStudies() {
    this.api
      .getBibleStudies()
      .then((data) => {
        this.bibleStudies = data;
        this.api.updateBibleStudies(data);
      })
      .catch((error) => {
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
      id: study.id,
    };

    this.api
      .updateStudy(studyData)
      .then(() => {
        this.loadBibLeStudies();
      })
      .catch((error) => {
        console.error('Error updating study:', error);
      });
  }

  async addStudy() {
    this.loading = true;
    const data = {
      bible_study: this.bible_study,
      address: this.address,
      schedule: this.schedule,
      type: this.type,
      lesson: this.next_lesson,
      updated_at: new Date(),
    };

    try {
      await this.api.addStudy(data);
      this.bible_study = '';
      this.address = '';
      this.schedule = '';
      this.type = 'rv';
      this.next_lesson = '';
      this.isSuccess = true;
      this.alertMessage = 'Study added successfully!';
      this.showStudyModal = false;
      this.loadBibLeStudies();
    } catch (error) {
      console.error('Error adding study:', error);
      this.isSuccess = false;
      this.alertMessage = 'Error adding study. Please try again.';
    }
    this.loading = false;
  }

  closeStudyModal() {
    this.showStudyModal = false;
    this.bible_study = '';
    this.address = '';
    this.schedule = '';
    this.type = 'rv';
    this.next_lesson = '';
    this.isSuccess = false;
  }

  downloadReport(report: any, isPioneer: boolean, index: number) {
    this.selectedReport = report;
    this.monthlyReportData = {
      month: `${report.month_name} ${report.year}`,
      bibleStudies: this.filterBibleStudies(this.bibleStudies).length,
      is_joined_ministry: report.is_joined_ministry,
      hours: isPioneer ? report.total_hours : undefined,
      report_count: report.report_count,
    };

    this.dropdownOpen[index] = false;
    this.util.generatePNG(this.monthlyReportData, isPioneer);
  }

  filterBibleStudies(studies: any[]): any[] {
    return studies.filter((study) => study.type !== 'rv');
  }

  closeDlModal() {
    this.openDownloadModal = false;
    this.isCopied = false;
  }

  toggleDropdown(index: number) {
    this.dropdownOpen[index] = !this.dropdownOpen[index];
    // Close other dropdowns
    Object.keys(this.dropdownOpen).forEach(key => {
      if (parseInt(key) !== index) {
        this.dropdownOpen[parseInt(key)] = false;
      }
    });
  }

  copyToClipboard(): void {
    if (!this.next_lesson) return;

    navigator.clipboard
      .writeText(this.next_lesson)
      .then(() => {
        this.isCopied = true;
        console.log('Text copied to clipboard');
      })
      .catch((err) => {
        this.isCopied = false;
        console.error('Failed to copy text: ', err);
      });
  }

  getReportCardClasses(index: number): string {
    const baseClasses =
      'group relative bg-white shadow-xl rounded-2xl border border-gray-200 transition-all duration-500 ease-out hover:shadow-2xl hover:-translate-y-2 hover:scale-[1.01] overflow-hidden';
    const borderColor = this.getReportBorderColor(index);
    const ringClass =
      this.hoveredReport === index
        ? 'ring-2 ring-purple-200 ring-opacity-60'
        : '';

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
    const maxHours = 50;
    return Math.min((hours / maxHours) * 100, 100);
  }

  getTotalHours(): number {
    return this.reports.reduce((sum, report) => sum + (report.total_hours || 0), 0);
  }

  getDisplayRange(): string {
    const start = (this.currentPage - 1) * this.itemsPerPage + 1;
    const end = Math.min(this.currentPage * this.itemsPerPage, this.reports.length);
    return `${start}-${end} of ${this.reports.length}`;
  }

  private getReportGradientColor(index: number): string {
    const gradients = [
      'from-purple-500 to-pink-600',
      'from-blue-500 to-indigo-600',
      'from-emerald-500 to-cyan-600',
      'from-orange-500 to-red-600',
    ];
    return gradients[index % gradients.length];
  }

  private getReportBorderColor(index: number): string {
    const colors = [
      'border-l-4 border-purple-500',
      'border-l-4 border-blue-500',
      'border-l-4 border-emerald-500',
      'border-l-4 border-orange-500',
    ];
    return colors[index % colors.length];
  }
}
