import { Injectable } from '@angular/core';
import { BehaviorSubject, fromEvent, merge } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class NetworkService {
  private onlineStatusSubject = new BehaviorSubject<boolean>(navigator.onLine);
  public onlineStatus$ = this.onlineStatusSubject.asObservable();

  constructor() {
    // Listen to online/offline events
    merge(
      fromEvent(window, 'online').pipe(map(() => true)),
      fromEvent(window, 'offline').pipe(map(() => false))
    ).subscribe((isOnline) => {
      this.onlineStatusSubject.next(isOnline);
      console.log(`Network status changed: ${isOnline ? 'Online' : 'Offline'}`);
    });
  }

  get isOnline(): boolean {
    return this.onlineStatusSubject.value;
  }
}

