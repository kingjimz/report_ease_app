import { Component } from '@angular/core';
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
  activeTab = 'calendar';
  
  tabs = [
    { 
      id: 'calendar', 
      title: 'Calendar', 
      icon: 'fas fa-calendar-alt',
      description: 'View upcoming events'
    },
    { 
      id: 'reports', 
      title: 'Reports', 
      icon: 'fas fa-chart-bar',
      description: 'Track your progress'
    },
    { 
      id: 'other', 
      title: 'Settings', 
      icon: 'fas fa-cog',
      description: 'Customize options'
    }
  ];
  
  getActiveTabIcon(): string {
    const activeTab = this.tabs.find(tab => tab.id === this.activeTab);
    return activeTab ? activeTab.icon : '';
  }
  
  getActiveTabTitle(): string {
    const activeTab = this.tabs.find(tab => tab.id === this.activeTab);
    return activeTab ? activeTab.title : '';
  }
}