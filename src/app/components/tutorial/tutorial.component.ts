import { Component, EventEmitter, Input, Output, OnInit, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TutorialService } from '../../_services/tutorial.service';
import { ModalService } from '../../_services/modal.service';

export interface TutorialStep {
  title: string;
  description: string;
  icon: string;
  highlight?: string; // CSS selector or element to highlight
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

@Component({
  selector: 'app-tutorial',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatButtonModule, MatProgressBarModule],
  templateUrl: './tutorial.component.html',
  styleUrls: ['./tutorial.component.css'],
})
export class TutorialComponent implements OnInit, OnChanges, OnDestroy {
  @Input() showTutorial: boolean = false;
  @Output() tutorialComplete = new EventEmitter<void>();
  @Output() tutorialSkip = new EventEmitter<void>();

  currentStep: number = 0;
  steps: TutorialStep[] = [
    {
      title: 'Welcome to Field Service Tracker!',
      description:
        'This app helps you track your ministry service hours, reports, and goals. Let\'s take a quick tour of the main features.',
      icon: 'home',
      position: 'center',
    },
    {
      title: 'Dashboard Overview',
      description:
        'The Dashboard shows your monthly hours, weekly progress, and statistics. You can see your Bible studies count, return visits, and track your monthly goals here.',
      icon: 'speed',
      position: 'center',
    },
    {
      title: 'Add Reports to Database',
      description:
        'Use the "Add Report" button at the top of the Dashboard to save a new service report to your account. You can record hours, minutes, Bible studies, and notes. Reports are saved and will appear on your calendar.',
      icon: 'add_circle',
      position: 'top',
    },
    {
      title: 'Calendar - Add & View Reports',
      description:
        'Switch to the Calendar tab to see all your reports on a calendar. Click on any date to add a new report or view/edit existing reports for that day.',
      icon: 'calendar_month',
      position: 'center',
    },
    {
      title: 'Generate Manual Report (PNG)',
      description:
        'The blue "+" button at the bottom center is for manually generating a report as a PNG image file. This creates a downloadable report without saving it to your account - useful for quick sharing or printing.',
      icon: 'image',
      position: 'bottom',
    },
    {
      title: 'Reports Section',
      description:
        'The Reports tab shows all your monthly reports in detail. You can download reports, view statistics, and manage your service history.',
      icon: 'menu_book',
      position: 'center',
    },
    {
      title: 'Goals',
      description:
        'In the Goals tab, you can configure your pioneer status, set goals, and customize your dashboard preferences.',
      icon: 'flag',
      position: 'center',
    },
    {
      title: 'Navigation',
      description:
        'Use the bottom navigation bar to switch between Dashboard, Calendar, Reports, and Goals. The tabs hide when you scroll down and reappear when you scroll up.',
      icon: 'explore',
      position: 'bottom',
    },
    {
      title: 'You\'re All Set!',
      description:
        'You can always access the Configure button in the header to adjust your settings. Start by adding your first report using the "Add Report" button on the Dashboard!',
      icon: 'check_circle',
      position: 'center',
    },
  ];

  Math = Math; // Expose Math to template

  constructor(
    private tutorialService: TutorialService,
    private modalService: ModalService,
  ) {}

  ngOnInit(): void {
    if (this.showTutorial) {
      this.currentStep = 0;
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['showTutorial']) {
      if (this.showTutorial) {
        this.modalService.openModal();
      } else {
        this.modalService.closeModal();
      }
    }
  }

  ngOnDestroy(): void {
    if (this.showTutorial) {
      this.modalService.closeModal();
    }
  }

  nextStep(): void {
    if (this.currentStep < this.steps.length - 1) {
      this.currentStep++;
    } else {
      this.completeTutorial();
    }
  }

  previousStep(): void {
    if (this.currentStep > 0) {
      this.currentStep--;
    }
  }

  skipTutorial(): void {
    this.tutorialService.completeTutorial();
    this.tutorialSkip.emit();
  }

  completeTutorial(): void {
    this.tutorialService.completeTutorial();
    this.tutorialComplete.emit();
  }

  get currentStepData(): TutorialStep {
    return this.steps[this.currentStep];
  }

  get progress(): number {
    return ((this.currentStep + 1) / this.steps.length) * 100;
  }

  get isFirstStep(): boolean {
    return this.currentStep === 0;
  }

  get isLastStep(): boolean {
    return this.currentStep === this.steps.length - 1;
  }
}

