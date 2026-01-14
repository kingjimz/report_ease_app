import { Component, OnInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../_services/api.service';
import { UtilService } from '../../_services/util.service';
import { LoaderComponent } from '../loader/loader.component';
import { ModalService } from '../../_services/modal.service';
import { ModalComponent } from '../modal/modal.component';
import { AlertsComponent } from '../alerts/alerts.component';
import { Subscription } from 'rxjs';

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
}

interface CalendarEvent {
  title: string;
  start: Date;
  color: { primary: string; secondary: string };
  meta: {
    report_id: string;
    notes: string;
    joined_ministry: string;
    hours: number;
    minutes: number;
  };
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, LoaderComponent, ModalComponent, AlertsComponent],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.css'],
})
export class CalendarComponent implements OnInit, OnDestroy {
  isLoading = false;
  viewMode: 'month' | 'week' | 'day' = 'month';
  viewDate = new Date();

  calendarDays: CalendarDay[] = [];
  weekDays: Date[] = [];
  daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  events: CalendarEvent[] = [];

  selectedDate: Date | null = null;
  hours = 0;
  joined_ministry = '';
  notes = '';
  report_date = '';
  created_at = '';
  updated_at = '';
  hasExistingEvent = false;
  report_id = '';
  note = '';
  minutes = 0;
  noChangeDetected = false;
  reports: any[] = [];
  public Math = Math;
  showDeleteConfirmModal = false;
  isDeleting = false;
  private reportsSubscription?: Subscription;
  
  // Add Report Modal properties (matching dashboard)
  showAddReportModal: boolean = false;
  reportDate: string = '';
  reportHours: number = 0;
  reportMinutes: number = 0;
  reportJoinedMinistry: string = 'yes';
  reportNotes: string = '';
  isSubmittingReport: boolean = false;
  reportSuccess: boolean = false;
  reportAlertMessage: string = '';
  isDateLocked: boolean = false; // Flag to lock date when opened from calendar

  constructor(
    private api: ApiService,
    private util: UtilService,
    private modalService: ModalService,
  ) {}

  ngOnInit() {
    this.generateCalendar();
    this.generateWeekDays();
    this.loadReports();
    
    // Subscribe to reports$ for immediate updates when reports are added offline
    this.reportsSubscription = this.api.reports$.subscribe((reports) => {
      if (reports && reports.length > 0) {
        this.updateEventsFromReports(reports);
      }
    });
  }

  ngOnDestroy(): void {
    // Clean up modal state if component is destroyed with modals open
    if (this.selectedDate || this.showDeleteConfirmModal || this.showAddReportModal) {
      this.modalService.closeModal();
    }
    // Clean up subscription
    if (this.reportsSubscription) {
      this.reportsSubscription.unsubscribe();
    }
  }

  generateCalendar() {
    const year = this.viewDate.getFullYear();
    const month = this.viewDate.getMonth();

    // Get first day of month and how many days in month
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();

    // Get first day of week (0 = Sunday)
    const firstDayOfWeek = firstDayOfMonth.getDay();

    // Calculate total cells needed (6 weeks * 7 days)
    const totalCells = 42;
    this.calendarDays = [];

    // Add previous month's trailing days
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const date = new Date(year, month, -i);
      this.calendarDays.push({
        date: date,
        isCurrentMonth: false,
        isToday: this.isToday(date),
      });
    }

    // Add current month's days
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      this.calendarDays.push({
        date: date,
        isCurrentMonth: true,
        isToday: this.isToday(date),
      });
    }

    // Add next month's leading days
    const remainingCells = totalCells - this.calendarDays.length;
    for (let day = 1; day <= remainingCells; day++) {
      const date = new Date(year, month + 1, day);
      this.calendarDays.push({
        date: date,
        isCurrentMonth: false,
        isToday: this.isToday(date),
      });
    }
  }

  generateWeekDays() {
    const startOfWeek = this.getStartOfWeek(this.viewDate);
    this.weekDays = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      this.weekDays.push(date);
    }
  }

  getStartOfWeek(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  }

  previousMonth() {
    if (this.viewMode === 'month') {
      this.viewDate = new Date(
        this.viewDate.getFullYear(),
        this.viewDate.getMonth() - 1,
        1,
      );
      this.generateCalendar();
    } else if (this.viewMode === 'week') {
      this.viewDate = new Date(
        this.viewDate.getTime() - 7 * 24 * 60 * 60 * 1000,
      );
      this.generateWeekDays();
    } else if (this.viewMode === 'day') {
      this.viewDate = new Date(this.viewDate.getTime() - 24 * 60 * 60 * 1000);
    }
  }

  nextMonth() {
    if (this.viewMode === 'month') {
      this.viewDate = new Date(
        this.viewDate.getFullYear(),
        this.viewDate.getMonth() + 1,
        1,
      );
      this.generateCalendar();
    } else if (this.viewMode === 'week') {
      this.viewDate = new Date(
        this.viewDate.getTime() + 7 * 24 * 60 * 60 * 1000,
      );
      this.generateWeekDays();
    } else if (this.viewMode === 'day') {
      this.viewDate = new Date(this.viewDate.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  // Event-related methods
  hasEvent(date: Date): boolean {
    return this.events.some(
      (event) => event.start.toDateString() === date.toDateString(),
    );
  }

  getEventHours(date: Date): string {
    const event = this.events.find(
      (e) => e.start.toDateString() === date.toDateString(),
    );
    if (event) {
      const hours = event.meta.hours || 0;
      const minutes = event.meta.minutes || 0;
      if (minutes === 0) {
        return `${hours}h`;
      }
      return `${hours}h ${minutes}m`;
    }
    return '';
  }

  getEventPreview(date: Date): string {
    const event = this.events.find(
      (e) => e.start.toDateString() === date.toDateString(),
    );
    return event ? event.title : '';
  }

  async loadReports() {
    this.isLoading = true;
    try {
      const data = await this.api.getReports();
      this.reports = this.util.aggregateReportsByMonth(data);
      this.api.updateAggregatedData(this.reports);
      this.updateEventsFromReports(data);
    } catch (error) {
      console.error('Error fetching reports:', error);
    }
    this.isLoading = false;
  }

  private updateEventsFromReports(reports: any[]) {
    this.events = reports.map((report: any) => {
      // Handle different date formats: Firestore timestamp, Date object, or temp ID
      let reportDate: Date;
      if (report.report_date?.seconds) {
        // Firestore timestamp
        reportDate = new Date(report.report_date.seconds * 1000);
      } else if (report.report_date?.toDate) {
        // Firestore timestamp with toDate method
        reportDate = report.report_date.toDate();
      } else if (report.report_date instanceof Date) {
        // Date object
        reportDate = report.report_date;
      } else if (typeof report.report_date === 'string') {
        // String date
        reportDate = new Date(report.report_date);
      } else {
        // Fallback to current date if invalid
        reportDate = new Date();
      }

      return {
        title: (report.hours || 0) + ' Hours',
        start: reportDate,
        color: { primary: '#008000', secondary: '#90EE90' },
        meta: {
          hours: report.hours || 0,
          minutes: report.minutes || 0,
          report_id: report.id,
          notes: report.notes || '',
          joined_ministry: report.is_joined_ministry || '',
        },
      };
    });
  }

  async saveReport() {
    if (!this.selectedDate) {
      return;
    }

    const report = {
      hours: this.hours,
      minutes: this.minutes,
      is_joined_ministry: this.joined_ministry,
      notes: this.note,
      report_date: this.selectedDate,
      created_at: new Date(),
      updated_at: new Date(),
    };

    try {
      await this.api.createReport(report);
      this.noChangeDetected = false;
      this.selectedDate = null;
      this.modalService.closeModal();
      await this.loadReports();
      this.reInitializeVariables();
    } catch (error) {
      console.error('Error saving report:', error);
    }
  }

  async updateReport() {
    if (!this.selectedDate) {
      return;
    }

    const existingEvent = this.events.find(
      (e) => e.start.toDateString() === this.selectedDate?.toDateString(),
    );

    if (existingEvent) {
      const existingHours = existingEvent.meta.hours || 0;
      const existingMinutes = existingEvent.meta.minutes || 0;
      const existingJoinedMinistry = existingEvent.meta.joined_ministry;
      const existingNotes = existingEvent.meta.notes;

      if (
        existingHours === this.hours &&
        existingMinutes === this.minutes &&
        existingJoinedMinistry === this.joined_ministry &&
        existingNotes === this.note
      ) {
        this.noChangeDetected = true;
        return;
      }
    }

    const report = {
      id: this.report_id,
      hours: this.hours,
      minutes: this.minutes,
      is_joined_ministry: this.joined_ministry,
      notes: this.note,
      report_date: this.selectedDate,
      created_at: new Date(),
      updated_at: new Date(),
    };

    try {
      await this.api.updateReport(report);
      this.noChangeDetected = false;
      this.selectedDate = null;
      this.modalService.closeModal();
      await this.loadReports();
      this.reInitializeVariables();
    } catch (error) {
      console.error('Error updating report:', error);
    }
  }

  openDeleteConfirmModal() {
    if (!this.report_id || !this.selectedDate) {
      return;
    }
    this.showDeleteConfirmModal = true;
    // Open another modal layer (delete confirmation on top of main modal)
    this.modalService.openModal();
  }

  closeDeleteConfirmModal() {
    this.showDeleteConfirmModal = false;
    // Close the delete confirmation modal (main modal remains open)
    this.modalService.closeModal();
  }

  async confirmDeleteReport() {
    if (!this.report_id || !this.selectedDate) {
      return;
    }

    this.isDeleting = true;

    try {
      await this.api.deleteReport(this.report_id);
      this.showDeleteConfirmModal = false;
      // Close both modals: delete confirmation modal and main modal
      this.modalService.closeModal(); // Close delete confirmation modal
      this.closeAddReportModal(); // Close main modal (this also resets selectedDate)
      await this.loadReports();
      this.reInitializeVariables();
    } catch (error) {
      console.error('Error deleting report:', error);
      this.reportSuccess = false;
      this.reportAlertMessage = 'Error deleting report. Please try again.';
    } finally {
      this.isDeleting = false;
    }
  }

  isToday(date: Date): boolean {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  getMonthYearDisplay(): string {
    return this.viewDate.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  }

  trackByDay(index: number, day: CalendarDay): string {
    return day.date.toISOString();
  }

  onDayClick(day: CalendarDay) {
    this.selectedDate = new Date(day.date);
    // Lock the date when opened from calendar
    this.isDateLocked = true;
    
    // Format date for input (YYYY-MM-DD)
    const dateStr = this.selectedDate.toISOString().split('T')[0];
    this.reportDate = dateStr;
    
    const existingEvent = this.events.find(
      (e) => e.start.toDateString() === this.selectedDate?.toDateString(),
    );
    this.hasExistingEvent = existingEvent ? true : false;

    if (existingEvent) {
      this.reportHours = existingEvent.meta.hours || 0;
      this.reportMinutes = existingEvent.meta.minutes || 0;
      this.report_id = existingEvent.meta.report_id;
      this.reportJoinedMinistry = existingEvent.meta.joined_ministry || 'yes';
      this.reportNotes = existingEvent.meta.notes || '';
      
      // Also set old variables for backward compatibility if needed
      this.hours = existingEvent.meta.hours || 0;
      this.minutes = existingEvent.meta.minutes || 0;
      this.joined_ministry = this.util.capitalizeFirstLetter(
        existingEvent.meta.joined_ministry,
      );
      this.note = existingEvent.meta.notes;
    } else {
      // Reset to defaults for new report
      this.reportHours = 0;
      this.reportMinutes = 0;
      this.reportJoinedMinistry = 'yes';
      this.reportNotes = '';
      this.report_id = '';
      this.reInitializeVariables();
    }
    
    // Open the modal
    this.openAddReportModal();
  }

  closeModal() {
    this.selectedDate = null;
    this.noChangeDetected = false;
    this.modalService.closeModal();
  }
  
  // Add Report Modal Methods (matching dashboard)
  openAddReportModal() {
    // Date is already set in onDayClick, and isDateLocked is set to true
    this.reportSuccess = false;
    this.reportAlertMessage = '';
    this.showAddReportModal = true;
  }
  
  closeAddReportModal() {
    this.showAddReportModal = false;
    this.selectedDate = null;
    this.isDateLocked = false;
    this.reportDate = '';
    this.reportHours = 0;
    this.reportMinutes = 0;
    this.reportJoinedMinistry = 'yes';
    this.reportNotes = '';
    this.reportSuccess = false;
    this.reportAlertMessage = '';
    this.report_id = '';
    this.hasExistingEvent = false;
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
  
  async saveReportFromModal() {
    if (!this.reportDate || !this.selectedDate) {
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
      // Use selectedDate which is already a Date object
      const report: any = {
        hours: this.reportHours || 0,
        minutes: this.reportMinutes || 0,
        is_joined_ministry: this.reportJoinedMinistry,
        notes: this.reportNotes || '',
        report_date: this.selectedDate,
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      if (this.hasExistingEvent && this.report_id) {
        // Update existing report
        report.id = this.report_id;
        await this.api.updateReport(report);
        this.reportSuccess = true;
        this.reportAlertMessage = 'Report updated successfully!';
      } else {
        // Create new report
        await this.api.createReport(report);
        this.reportSuccess = true;
        this.reportAlertMessage = 'Report added successfully! It will appear on your calendar.';
      }
      
      // Reload reports to update calendar
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

  reInitializeVariables() {
    this.hours = 0;
    this.minutes = 0;
    this.joined_ministry = '';
    this.notes = '';
    this.report_date = '';
    this.created_at = '';
    this.updated_at = '';
    this.report_id = '';
    this.note = '';
  }

  get dayOfWeek(): string {
    return this.viewDate.toLocaleDateString('en-US', { weekday: 'short' });
  }
}
