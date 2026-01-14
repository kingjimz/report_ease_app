import { Component, Signal, computed, OnInit, OnDestroy } from '@angular/core';
import { ApiService } from '../../_services/api.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UtilService } from '../../_services/util.service';
import { ModalComponent } from '../modal/modal.component';
import { LoaderComponent } from '../loader/loader.component';
import { AlertsComponent } from '../alerts/alerts.component';
import { ModalService } from '../../_services/modal.service';
import { SettingsService } from '../../_services/settings.service';

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
export class ReportsComponent implements OnDestroy {
  reports: any[] = [];
  paginatedReports: any[] = [];

  bibleStudies: any[] = [];
  studySelected: any = null;
  isSelected = false;
  studyDelete = false;
  next_lesson = '';
  editSchedule = ''; // Add property for editing schedule (datetime-local format)
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
  itemsPerPage = 2;
  totalPages = 0;
  showAllReports = false;
  
  // Library view properties
  searchQuery: string = '';
  filterType: 'all' | 'bs' | 'rv' = 'all';
  filteredBibleStudies: any[] = [];
  showAllBibleStudies = false;
  
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
  
  // Generate Report Modal properties
  showGenerateReportModal: boolean = false;
  generateReportDate: string = '';
  generateReportHours: number = 0;
  generateReportBibleStudies: number = 0;
  generateReportJoinedMinistry: string = 'yes';
  isGeneratingReport: boolean = false;
  generateReportSuccess: boolean = false;
  generateReportAlertMessage: string = '';

  constructor(
    public api: ApiService,
    public util: UtilService,
    private modalService: ModalService,
    private settingsService: SettingsService,
  ) {}

  ngOnInit() {
    this.loadReports();
    this.loadBibLeStudies();
    this.loadUserSettings();
    // Set default date to today for modals
    const today = new Date();
    this.reportDate = today.toISOString().split('T')[0];
    this.generateReportDate = today.toISOString().split('T')[0];
    setTimeout(() => {
      this.loading = false;
    }, 1000);
  }

  loadUserSettings() {
    this.settingsService.settings$.subscribe(settings => {
      this.isPioneer = settings.isPioneer;
    });
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
        this.applyFilters();
      } else {
        this.bibleStudies = [];
        this.filteredBibleStudies = [];
        this.numberOfBibleStudies = 0;
        this.numberOfReturnVisits = 0;
      }
    });
  }
  
  applyFilters() {
    let filtered = [...this.bibleStudies];
    
    // Filter by type
    if (this.filterType !== 'all') {
      filtered = filtered.filter(study => study.type === this.filterType);
    }
    
    // Filter by search query
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(study => 
        study.bible_study?.toLowerCase().includes(query) ||
        study.address?.toLowerCase().includes(query) ||
        study.schedule?.toLowerCase().includes(query)
      );
    }
    
    this.filteredBibleStudies = filtered;
  }
  
  onSearchChange() {
    this.applyFilters();
  }
  
  onFilterChange() {
    this.applyFilters();
  }

  loadReports() {
    // Subscribe to aggregated data (updated by dashboard/calendar)
    this.api.aggregatedData$.subscribe((data) => {
      if (data && Array.isArray(data) && data.length > 0) {
        this.reports = data;
        this.calculatePagination();
        this.updatePaginatedReports();
        this.loading = false;
      }
    });

    // Also subscribe to raw reports and aggregate them to ensure data is always available
    this.api.reports$.subscribe((reports) => {
      if (reports && reports.length > 0) {
        // Always aggregate reports to ensure data is available
        const aggregatedReports = this.util.aggregateReportsByMonth(reports);
        
        // Update aggregated data in API service
        this.api.updateAggregatedData(aggregatedReports);
        
        // Update local reports if not already set from aggregatedData$ subscription
        if (!this.reports || this.reports.length === 0) {
          this.reports = aggregatedReports;
          this.calculatePagination();
          this.updatePaginatedReports();
        }
        this.loading = false;
      } else if (reports && reports.length === 0) {
        // No reports available
        this.reports = [];
        this.paginatedReports = [];
        this.loading = false;
      }
    });
  }
  
  toggleShowAllReports() {
    this.showAllReports = !this.showAllReports;
    if (this.showAllReports) {
      this.itemsPerPage = this.reports.length;
    } else {
      this.itemsPerPage = 2;
    }
    this.calculatePagination();
    this.updatePaginatedReports();
  }
  
  toggleShowAllBibleStudies() {
    this.showAllBibleStudies = !this.showAllBibleStudies;
  }
  
  getDisplayedBibleStudies() {
    if (this.showAllBibleStudies) {
      return this.filteredBibleStudies;
    }
    return this.filteredBibleStudies.slice(0, 2);
  }
  
  formatNameForMobile(name: string): string {
    if (!name) return '';
    
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return name; // Single name, return as is
    
    // Get all parts except the last one (first/middle names)
    const firstNames = parts.slice(0, -1);
    const lastName = parts[parts.length - 1];
    
    // Convert first names to initials
    const initials = firstNames.map(part => part.charAt(0).toUpperCase() + '.').join(' ');
    
    return `${initials} ${lastName}`;
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
    // Convert schedule to datetime-local format
    if (study.schedule) {
      const scheduleDate = this.parseScheduleToDate(study.schedule);
      this.editSchedule = scheduleDate ? this.formatDateForInput(scheduleDate) : '';
    } else {
      this.editSchedule = '';
    }
  }
  
  // Convert schedule string/date to Date object
  parseScheduleToDate(schedule: any): Date | null {
    if (!schedule) return null;
    
    // If it's already a Date object
    if (schedule instanceof Date) {
      return schedule;
    }
    
    // If it's a Firestore Timestamp
    if (schedule.toDate && typeof schedule.toDate === 'function') {
      return schedule.toDate();
    }
    
    // If it's a Firestore Timestamp with seconds
    if (schedule.seconds) {
      return new Date(schedule.seconds * 1000);
    }
    
    // If it's a string (ISO format or other)
    if (typeof schedule === 'string') {
      const date = new Date(schedule);
      return isNaN(date.getTime()) ? null : date;
    }
    
    return null;
  }
  
  // Format Date object to datetime-local input format (YYYY-MM-DDTHH:mm)
  formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }
  
  // Convert datetime-local string to Date object for saving
  parseInputToDate(inputValue: string): Date | null {
    if (!inputValue) return null;
    const date = new Date(inputValue);
    return isNaN(date.getTime()) ? null : date;
  }
  
  // Format schedule for display (handles both Date objects and strings)
  formatScheduleForDisplay(schedule: any): string {
    if (!schedule) return 'Not scheduled';
    
    const scheduleDate = this.parseScheduleToDate(schedule);
    if (scheduleDate) {
      // Format as readable date and time
      return scheduleDate.toLocaleString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    }
    
    // Fallback to string if it's not a date
    return String(schedule);
  }

  isStudyOverdue(study: any): boolean {
    if (!study.schedule) return false;

    const scheduleDate = this.parseScheduleToDate(study.schedule);
    if (!scheduleDate || isNaN(scheduleDate.getTime())) {
      return false;
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    scheduleDate.setHours(0, 0, 0, 0);

    // Check if scheduled date has passed
    return scheduleDate < now;
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
    this.modalService.openModal();
  }

  async confirmDelete() {
    this.studyDelete = false;
    this.isCopied = false;
    this.modalService.closeModal();
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
    this.modalService.closeModal();
  }

  updateStudy(study: any) {
    this.isSelected = false;
    this.studySelected = null;
    this.isCopied = false;

    // Convert editSchedule to Date object for saving
    const scheduleDate = this.parseInputToDate(this.editSchedule);
    
    const studyData = {
      bible_study: study.bible_study,
      address: study.address,
      schedule: scheduleDate || this.editSchedule, // Save as Date if valid, otherwise as string
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
    
    // Convert schedule to Date object if it's a datetime-local value
    const scheduleDate = this.parseInputToDate(this.schedule);
    
    const data = {
      bible_study: this.bible_study,
      address: this.address,
      schedule: scheduleDate || this.schedule, // Save as Date if valid, otherwise as string
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

  downloadReport(report: any, index: number) {
    this.selectedReport = report;
    this.monthlyReportData = {
      month: `${report.month_name} ${report.year}`,
      bibleStudies: this.filterBibleStudies(this.bibleStudies).length,
      is_joined_ministry: report.is_joined_ministry,
      hours: this.isPioneer ? report.total_hours : undefined,
      report_count: report.report_count,
    };

    this.dropdownOpen[index] = false;
    this.util.generatePNG(this.monthlyReportData, this.isPioneer);
  }

  async shareReport(report: any, index: number) {
    this.selectedReport = report;
    this.monthlyReportData = {
      month: `${report.month_name} ${report.year}`,
      bibleStudies: this.filterBibleStudies(this.bibleStudies).length,
      is_joined_ministry: report.is_joined_ministry,
      hours: this.isPioneer ? report.total_hours : undefined,
      report_count: report.report_count,
    };

    this.dropdownOpen[index] = false;
    await this.util.shareReport(this.monthlyReportData, this.isPioneer);
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

  ngOnDestroy(): void {
    // Clean up modal state if component is destroyed with modals open
    if (this.studyDelete) {
      this.modalService.closeModal();
    }
  }
  
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
      
      // Reports will update automatically through subscriptions
      
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
  
  // Generate Report Modal Methods
  openGenerateReportModal() {
    const today = new Date();
    this.generateReportDate = today.toISOString().split('T')[0];
    this.generateReportHours = 0;
    this.generateReportBibleStudies = 0;
    this.generateReportJoinedMinistry = 'yes';
    this.isGeneratingReport = false;
    this.generateReportSuccess = false;
    this.generateReportAlertMessage = '';
    this.showGenerateReportModal = true;
  }
  
  closeGenerateReportModal() {
    this.showGenerateReportModal = false;
    this.generateReportDate = '';
    this.generateReportHours = 0;
    this.generateReportBibleStudies = 0;
    this.generateReportJoinedMinistry = 'yes';
    this.generateReportSuccess = false;
    this.generateReportAlertMessage = '';
  }
  
  incrementGenerateHours() {
    this.generateReportHours++;
  }
  
  decrementGenerateHours() {
    if (this.generateReportHours > 0) {
      this.generateReportHours--;
    }
  }
  
  incrementGenerateBibleStudies() {
    this.generateReportBibleStudies++;
  }
  
  decrementGenerateBibleStudies() {
    if (this.generateReportBibleStudies > 0) {
      this.generateReportBibleStudies--;
    }
  }
  
  generateManualReport() {
    if (!this.generateReportDate || !this.generateReportHours || !this.generateReportJoinedMinistry) {
      this.generateReportSuccess = false;
      this.generateReportAlertMessage = 'Please fill in all required fields.';
      return;
    }

    this.isGeneratingReport = true;

    // Parse the date to get month and year
    const selectedDate = new Date(this.generateReportDate);
    const monthName = selectedDate.toLocaleDateString('en-US', { month: 'long' });
    const year = selectedDate.getFullYear();

    // Prepare data for PNG generation (exactly matching reports component structure)
    const reportData = {
      month: `${monthName} ${year}`,
      bibleStudies: this.generateReportBibleStudies,
      is_joined_ministry: this.generateReportJoinedMinistry,
      hours: this.isPioneer ? this.generateReportHours : undefined,
      report_count: 1,
    };

    try {
      // Generate PNG without saving to database
      this.util.generatePNG(reportData, this.isPioneer);

      this.generateReportSuccess = true;
      this.generateReportAlertMessage = 'Report generated successfully! Check your downloads.';

      setTimeout(() => {
        this.closeGenerateReportModal();
      }, 1500);
    } catch (error) {
      console.error('Error generating report:', error);
      this.generateReportSuccess = false;
      this.generateReportAlertMessage = 'Error generating report. Please try again.';
    } finally {
      this.isGeneratingReport = false;
    }
  }
}
