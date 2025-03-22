import { Component, signal, OnInit } from '@angular/core';
import { CalendarView, CalendarEvent, CalendarMonthViewComponent } from 'angular-calendar';
import { AngularCalendarModule } from './calendar.module';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../_services/api.service';
import { subMonths, addMonths } from 'date-fns';


@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [AngularCalendarModule, CommonModule, FormsModule],
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.css'
})
export class CalendarComponent {
  viewDate: Date = new Date();
  selectedDate: Date | null = null;
  events: CalendarEvent[] = [];
  viewMode: 'month' | 'week' | 'day' = 'month';
  hours = 0;
  joined_ministry = '';
  notes = '';
  report_date = '';
  created_at = '';
  updated_at = '';
  isLoading = false;
  hasExistingEvent = false;
  report_id = '';
  note = '';
  noChangeDetected = false;


  constructor(private api: ApiService) { }


  ngOnInit() {
    this.loadReports();
  }

  async dayClicked(event: { date: Date }) {
    this.selectedDate = event.date;    
    // Check if there is an existing event on the selected date
    const existingEvent = this.events.find(e => e.start.toDateString() === this.selectedDate?.toDateString());
    this.hasExistingEvent = existingEvent ? true : false;
    
    if (existingEvent) {
      this.hours = parseInt(existingEvent.title.split(' ')[0], 10);
      this.report_id = existingEvent.meta.report_id;
      this.selectedDate = existingEvent.start;
      this.joined_ministry = this.capitalizeFirstLetter(existingEvent.meta.joined_ministry);
      this.note = existingEvent.meta.notes;
    } else { 
      this.reInitializeVariables();
    }
  }

  async loadReports() {
    this.isLoading = true;
    await this.api.getReports().then((data) => {
      this.events = data.map((report: any) => {
        this.report_id = report.id;
        return {
          title: report.hours + ' Hours',
          start: new Date(report.report_date.seconds * 1000),
          color: { primary: '#008000', secondary: '#90EE90' },
          meta: {
            report_id: report.id,
            notes: report.notes,
            joined_ministry: report.is_joined_ministry
          }
        };
      });
  
    }).catch(error => {
      console.error('Error fetching reports:', error);
      this.isLoading = false;
    });
    this.isLoading = false;
  }

  async saveReport() {
    if (!this.selectedDate) {
      return;
    }

    const report = {
      hours: this.hours,
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

    const existingEvent = this.events.find(e => e.start.toDateString() === this.selectedDate?.toDateString());

    if (existingEvent) {
      const existingHours = parseInt(existingEvent.title.split(' ')[0], 10);
      const existingJoinedMinistry = existingEvent.meta.joined_ministry;
      const existingNotes = existingEvent.meta.notes;

      if (
        existingHours === this.hours &&
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


  capitalizeFirstLetter(text: string) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  previousMonth() {
    this.viewDate = subMonths(this.viewDate, 1);
  }

  nextMonth() {
    this.viewDate = addMonths(this.viewDate, 1);
  }

  closeModal() {
    this.selectedDate = null;
    this.noChangeDetected = false;
  }

  reInitializeVariables() {
    this.hours = 0;
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
