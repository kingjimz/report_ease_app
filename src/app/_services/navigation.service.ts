import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class NavigationService {
  private tabChangeSubject = new BehaviorSubject<string>('dashboard');
  public tabChange$: Observable<string> = this.tabChangeSubject.asObservable();

  changeTab(tabId: string) {
    this.tabChangeSubject.next(tabId);
  }

  getCurrentTab(): string {
    return this.tabChangeSubject.value;
  }
}
