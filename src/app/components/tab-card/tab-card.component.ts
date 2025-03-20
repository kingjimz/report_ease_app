import { Component, Output, EventEmitter } from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { CalendarComponent } from '../calendar/calendar.component';

@Component({
  standalone: true,
  selector: 'app-tab-card',
  templateUrl: './tab-card.component.html',
  styleUrls: ['./tab-card.component.scss'],
  imports:
    [CommonModule, CalendarComponent],
})
export class TabCardComponent {
  @Output() tabChange = new EventEmitter<string>();
  activeTab = 'calendar';
  
  tabs = [
    { 
      id: 'calendar', 
      title: 'Calendar', 
      icon: 'bi bi-calendar-fill',
      description: 'View upcoming events'
    },
    { 
      id: 'reports', 
      title: 'Reports', 
      icon: 'bi bi-clipboard2-data',
      description: 'Track your progress'
    },
    { 
      id: 'other', 
      title: 'Settings', 
      icon: 'bi bi-gear-fill',
      description: 'Customize options'
    }
  ];
  
  getActiveTabTitle(): string {
    const activeTab = this.tabs.find(tab => tab.id === this.activeTab);
    return activeTab ? activeTab.title : '';
  }

  selectTab(tabId: string) {
    this.activeTab = tabId;
    this.tabChange.emit(tabId);
  }
}