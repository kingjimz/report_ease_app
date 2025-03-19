import { Component } from '@angular/core';
import { CalendarView, CalendarEvent, CalendarMonthViewComponent } from 'angular-calendar';
import { AngularCalendarModule } from './calendar.module';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';


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
  hours = 5;
  events: CalendarEvent[] = [];
  viewMode: 'month' | 'week' | 'day' = 'month';

  constructor() { }


  async dayClicked(event: { date: Date }) {
    this.selectedDate = event.date;
    console.log('dayClicked', event);
  }

  closeModal() {
    this.selectedDate = null;
  }

  get dayOfWeek(): string {
    return this.viewDate.toLocaleDateString('en-US', { weekday: 'short' });
  }

}
