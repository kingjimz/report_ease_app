import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TutorialComponent } from './tutorial.component';
import { TutorialService } from '../../_services/tutorial.service';

describe('TutorialComponent', () => {
  let component: TutorialComponent;
  let fixture: ComponentFixture<TutorialComponent>;
  let tutorialService: jasmine.SpyObj<TutorialService>;

  beforeEach(async () => {
    const tutorialServiceSpy = jasmine.createSpyObj('TutorialService', [
      'hasCompletedTutorial',
      'completeTutorial',
      'resetTutorial',
    ]);

    await TestBed.configureTestingModule({
      imports: [TutorialComponent],
      providers: [{ provide: TutorialService, useValue: tutorialServiceSpy }],
    }).compileComponents();

    tutorialService = TestBed.inject(
      TutorialService
    ) as jasmine.SpyObj<TutorialService>;
    fixture = TestBed.createComponent(TutorialComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with first step', () => {
    component.showTutorial = true;
    component.ngOnInit();
    expect(component.currentStep).toBe(0);
  });

  it('should move to next step', () => {
    component.currentStep = 0;
    component.nextStep();
    expect(component.currentStep).toBe(1);
  });

  it('should move to previous step', () => {
    component.currentStep = 2;
    component.previousStep();
    expect(component.currentStep).toBe(1);
  });

  it('should complete tutorial on last step', () => {
    component.currentStep = component.steps.length - 1;
    spyOn(component.tutorialComplete, 'emit');
    component.nextStep();
    expect(tutorialService.completeTutorial).toHaveBeenCalled();
    expect(component.tutorialComplete.emit).toHaveBeenCalled();
  });

  it('should skip tutorial', () => {
    spyOn(component.tutorialSkip, 'emit');
    component.skipTutorial();
    expect(tutorialService.completeTutorial).toHaveBeenCalled();
    expect(component.tutorialSkip.emit).toHaveBeenCalled();
  });

  it('should calculate progress correctly', () => {
    component.currentStep = 0;
    expect(component.progress).toBe((1 / component.steps.length) * 100);
  });
});

