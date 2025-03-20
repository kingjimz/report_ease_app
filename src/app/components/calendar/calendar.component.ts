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
  dailyNotes: string = '';
  savedNotes: string = '';
  events: CalendarEvent[] = [];
  viewMode: 'month' | 'week' | 'day' = 'month';
  hours = 0;
  joined_ministry = false;
  notes = '';
  report_date = '';
  created_at = '';
  updated_at = '';
  isLoading = false;



  constructor(private api: ApiService) { }


  ngOnInit() {
    this.loadReports();
  }

  // Navigate to the previous month
  previousMonth() {
    this.viewDate = subMonths(this.viewDate, 1);
  }

  // Navigate to the next month
  nextMonth() {
    this.viewDate = addMonths(this.viewDate, 1);
  }
  

  async dayClicked(event: { date: Date }) {
    this.selectedDate = event.date;    
    // Check if there is an existing event on the selected date
    const existingEvent = this.events.find(e => e.start.toDateString() === this.selectedDate?.toDateString());
    
    if (existingEvent) {
      console.log('Existing event found:', existingEvent);
      this.hours = parseInt(existingEvent.title.split(' ')[0], 10);
      this.notes = this.savedNotes;
      this.selectedDate = null;
    } else {
      this.hours = 0;
      this.notes = '';
    }
  }

  async loadReports() {
    this.isLoading = true;
    await this.api.getReports().then((data) => {

      this.events = data.map((report: any) => {
        return {
          title: report.hours + ' Hours',
          start: new Date(report.report_date.seconds * 1000),
          color: { primary: '#008000', secondary: '#90EE90' },
        };
      });
  
    }).catch(error => {
      console.error('Error fetching reports:', error);
      this.isLoading = false;
    });
    this.isLoading = false;
  }

  closeModal() {
    this.selectedDate = null;
  }

  get dayOfWeek(): string {
    return this.viewDate.toLocaleDateString('en-US', { weekday: 'short' });
  }

  saveReport() {
    if (!this.selectedDate) {
      console.error('No date selected');
      return;
    }
  
    const report = {
      hours: this.hours,
      is_joined_ministry: this.joined_ministry,
      notes: this.notes,
      report_date: this.selectedDate,
      created_at: new Date(),
      updated_at: new Date(),
    };
      this.api.createReport(report)
        .then(() => {
          console.log('Report saved');
          this.savedNotes = this.dailyNotes;
          this.selectedDate = null;
          this.loadReports();
        })
        .catch((error) => {
          console.error('Error saving report:', error);
        });
      }
}
