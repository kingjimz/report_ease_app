import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../_services/api.service';
import { UtilService } from '../../_services/util.service';
import { LoaderComponent } from '../loader/loader.component';

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
  imports: [CommonModule, FormsModule, LoaderComponent],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.css']
})
export class CalendarComponent implements OnInit {
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
  constructor(private api: ApiService, private util: UtilService) { }

  ngOnInit() {
    this.generateCalendar();
    this.generateWeekDays();
    this.loadReports();
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
        isToday: this.isToday(date)
      });
    }
    
    // Add current month's days
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      this.calendarDays.push({
        date: date,
        isCurrentMonth: true,
        isToday: this.isToday(date)
      });
    }
    
    // Add next month's leading days
    const remainingCells = totalCells - this.calendarDays.length;
    for (let day = 1; day <= remainingCells; day++) {
      const date = new Date(year, month + 1, day);
      this.calendarDays.push({
        date: date,
        isCurrentMonth: false,
        isToday: this.isToday(date)
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
      this.viewDate = new Date(this.viewDate.getFullYear(), this.viewDate.getMonth() - 1, 1);
      this.generateCalendar();
    } else if (this.viewMode === 'week') {
      this.viewDate = new Date(this.viewDate.getTime() - (7 * 24 * 60 * 60 * 1000));
      this.generateWeekDays();
    } else if (this.viewMode === 'day') {
      this.viewDate = new Date(this.viewDate.getTime() - (24 * 60 * 60 * 1000));
    }
  }
  
  nextMonth() {
    if (this.viewMode === 'month') {
      this.viewDate = new Date(this.viewDate.getFullYear(), this.viewDate.getMonth() + 1, 1);
      this.generateCalendar();
    } else if (this.viewMode === 'week') {
      this.viewDate = new Date(this.viewDate.getTime() + (7 * 24 * 60 * 60 * 1000));
      this.generateWeekDays();
    } else if (this.viewMode === 'day') {
      this.viewDate = new Date(this.viewDate.getTime() + (24 * 60 * 60 * 1000));
    }
  }

  // Event-related methods
  hasEvent(date: Date): boolean {
    return this.events.some(event => 
      event.start.toDateString() === date.toDateString()
    );
  }

  getEventHours(date: Date): string {
    const event = this.events.find(e =>
      e.start.toDateString() === date.toDateString()
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
    const event = this.events.find(e => 
      e.start.toDateString() === date.toDateString()
    );
    return event ? event.title : '';
  }

  async loadReports() {
    this.isLoading = true;
    try {
      const data = await this.api.getReports();
      this.reports = this.util.aggregateReportsByMonth(data);
      this.api.updateAggregatedData(this.reports);
     
      this.events = data.map((report: any) => {
        return {
          title: report.hours + ' Hours',
          start: new Date(report.report_date.seconds * 1000),
          color: { primary: '#008000', secondary: '#90EE90' },
          meta: {
            hours: report.hours || 0,
            minutes: report.minutes || 0,
            report_id: report.id,
            notes: report.notes,
            joined_ministry: report.is_joined_ministry
          }
        };
      });
    } catch (error) {
      console.error('Error fetching reports:', error);
    }
    this.isLoading = false;
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

    const existingEvent = this.events.find(e => 
      e.start.toDateString() === this.selectedDate?.toDateString()
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
      await this.loadReports();
      this.reInitializeVariables();
    } catch (error) {
      console.error('Error updating report:', error);
    }
  }

  isToday(date: Date): boolean {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  getMonthYearDisplay(): string {
    return this.viewDate.toLocaleDateString('en-US', { 
      month: 'long', 
      year: 'numeric' 
    });
  }

  trackByDay(index: number, day: CalendarDay): string {
    return day.date.toISOString();
  }

  onDayClick(day: CalendarDay) {
    this.selectedDate = new Date(day.date);
    const existingEvent = this.events.find(e => 
      e.start.toDateString() === this.selectedDate?.toDateString()
    );
    this.hasExistingEvent = existingEvent ? true : false;
    
    if (existingEvent) {
      this.hours = existingEvent.meta.hours || 0;
      this.minutes = existingEvent.meta.minutes || 0;
      this.report_id = existingEvent.meta.report_id;
      this.selectedDate = existingEvent.start;
      this.joined_ministry = this.util.capitalizeFirstLetter(existingEvent.meta.joined_ministry);
      this.note = existingEvent.meta.notes;
    } else { 
      this.reInitializeVariables();
    }
  }
  
  closeModal() {
    this.selectedDate = null;
    this.noChangeDetected = false;
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