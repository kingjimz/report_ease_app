import { Component, Output, EventEmitter, Input, OnInit } from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { CalendarComponent } from '../calendar/calendar.component';

@Component({
  standalone: true,
  selector: 'app-tab-card',
  templateUrl: './tab-card.component.html',
  styleUrls: ['./tab-card.component.css'],
  imports:
    [CommonModule],
})
export class TabCardComponent implements OnInit {
  @Output() tabChange = new EventEmitter<string>();
  @Input() selectedTab: string = 'dashboard';

  activeTab = 'dashboard';
  
  tabs = [
    {
      id: 'dashboard', 
      title: 'Dashboard',
      icon: 'bi bi-house-fill',
      description: 'Overview of your activities'
    },
    { 
      id: 'calendar', 
      title: 'Calendar', 
      icon: 'bi bi-calendar-fill',
      description: 'View upcoming events'
    },
    { 
      id: 'reports', 
      title: 'Reports', 
      icon: 'bi bi-book-half',
      description: 'Track your progress'
    },
    {   
      id: 'goals', 
      title: 'Goals', 
      icon: 'bi bi-flag-fill',
      description: 'Set and manage your goals'
    }
  ];

  ngOnInit(): void {
        if (this.selectedTab && this.selectedTab !== this.activeTab) {
      this.activeTab = this.selectedTab;
    }
  }
  
  getActiveTabTitle(): string {
    const activeTab = this.tabs.find(tab => tab.id === this.activeTab);
    return activeTab ? activeTab.title : '';
  }

  selectTab(tabId: string) {
    this.activeTab = tabId;
    this.tabChange.emit(tabId);
  }
}