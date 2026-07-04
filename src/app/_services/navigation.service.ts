import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

export interface StudyFilter {
  section: string;
  filter: 'all' | 'bs' | 'rv';
}

@Injectable({
  providedIn: 'root',
})
export class NavigationService {
  private tabChangeSubject = new BehaviorSubject<string>('dashboard');
  public tabChange$: Observable<string> = this.tabChangeSubject.asObservable();

  private studyFilterSubject = new Subject<StudyFilter>();
  public studyFilter$ = this.studyFilterSubject.asObservable();

  private openAddStudySubject = new Subject<void>();
  public openAddStudy$ = this.openAddStudySubject.asObservable();

  navigateToStudies(filter: 'bs' | 'rv') {
    this.changeTab('reports');
    setTimeout(() => {
      this.studyFilterSubject.next({ section: 'studiesSection', filter });
    }, 100);
  }

  navigateAndAddStudy() {
    this.changeTab('reports');
    setTimeout(() => {
      this.openAddStudySubject.next();
    }, 200);
  }

  // Whether the bottom tab bar is currently shown (vs. slid away on scroll).
  // Lets globally-mounted UI (e.g. the chat button) ride along with it.
  private tabBarVisibleSubject = new BehaviorSubject<boolean>(true);
  public tabBarVisible$: Observable<boolean> =
    this.tabBarVisibleSubject.asObservable();

  changeTab(tabId: string) {
    this.tabChangeSubject.next(tabId);
  }

  getCurrentTab(): string {
    return this.tabChangeSubject.value;
  }

  setTabBarVisible(visible: boolean) {
    if (this.tabBarVisibleSubject.value !== visible) {
      this.tabBarVisibleSubject.next(visible);
    }
  }
}
