import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class TutorialService {
  private readonly TUTORIAL_COMPLETED_KEY = 'tutorialCompleted';
  private tutorialCompletedSubject = new BehaviorSubject<boolean>(
    this.hasCompletedTutorial()
  );

  constructor() {}

  /**
   * Check if tutorial has been completed
   */
  hasCompletedTutorial(): boolean {
    return localStorage.getItem(this.TUTORIAL_COMPLETED_KEY) === 'true';
  }

  /**
   * Mark tutorial as completed
   */
  completeTutorial(): void {
    localStorage.setItem(this.TUTORIAL_COMPLETED_KEY, 'true');
    this.tutorialCompletedSubject.next(true);
  }

  /**
   * Reset tutorial (for testing or if user wants to see it again)
   */
  resetTutorial(): void {
    localStorage.removeItem(this.TUTORIAL_COMPLETED_KEY);
    this.tutorialCompletedSubject.next(false);
  }

  /**
   * Observable to watch tutorial completion status
   */
  get tutorialCompleted$(): Observable<boolean> {
    return this.tutorialCompletedSubject.asObservable();
  }
}

