import { Component, Output, EventEmitter, Input, OnInit, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { CalendarComponent } from '../calendar/calendar.component';
import { NavigationService } from '../../_services/navigation.service';
import { Subscription } from 'rxjs';

@Component({
  standalone: true,
  selector: 'app-tab-card',
  templateUrl: './tab-card.component.html',
  styleUrls: ['./tab-card.component.css'],
  imports: [CommonModule],
})
export class TabCardComponent implements OnInit, OnChanges, OnDestroy {
  @Output() tabChange = new EventEmitter<string>();
  @Output() manualReportModalOpen = new EventEmitter<void>();
  @Output() addReportModalOpen = new EventEmitter<void>();
  @Input() selectedTab: string = 'dashboard';

  activeTab = 'dashboard';
  private navigationSubscription?: Subscription;

  tabs = [
    {
      id: 'dashboard',
      title: 'Home',
      icon: 'bi bi-house-fill',
      description: 'Overview of your activities',
    },
    {
      id: 'calendar',
      title: 'Calendar',
      icon: 'bi bi-calendar-fill',
      description: 'View upcoming events',
    },
    {
      id: 'reports',
      title: 'Reports',
      icon: 'bi bi-book-half',
      description: 'Track your progress',
    },
    {
      id: 'goals',
      title: 'Goals',
      icon: 'bi bi-flag-fill',
      description: 'Set and manage your goals',
    },
  ];

  constructor(private navigationService: NavigationService) {}

  ngOnInit(): void {
    if (this.selectedTab && this.selectedTab !== this.activeTab) {
      this.activeTab = this.selectedTab;
    }
    
    // Subscribe to navigation service for immediate updates
    this.navigationSubscription = this.navigationService.tabChange$.subscribe((tabId) => {
      this.activeTab = tabId;
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedTab'] && changes['selectedTab'].currentValue) {
      this.activeTab = changes['selectedTab'].currentValue;
    }
  }

  ngOnDestroy(): void {
    if (this.navigationSubscription) {
      this.navigationSubscription.unsubscribe();
    }
  }

  getActiveTabTitle(): string {
    const activeTab = this.tabs.find((tab) => tab.id === this.activeTab);
    return activeTab ? activeTab.title : '';
  }

  selectTab(tabId: string) {
    this.activeTab = tabId;
    this.tabChange.emit(tabId);
  }

  openManualReportModal() {
    this.manualReportModalOpen.emit();
  }
  
  openAddReportModal() {
    this.addReportModalOpen.emit();
  }
}
