import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ModalService {
  private modalOpenSubject = new BehaviorSubject<boolean>(false);
  public modalOpen$: Observable<boolean> = this.modalOpenSubject.asObservable();

  private modalCount = 0;

  /**
   * Register that a modal is open
   */
  openModal(): void {
    this.modalCount++;
    if (this.modalCount > 0) {
      this.modalOpenSubject.next(true);
      this.lockBodyScroll();
    }
  }

  /**
   * Register that a modal is closed
   */
  closeModal(): void {
    this.modalCount = Math.max(0, this.modalCount - 1);
    if (this.modalCount === 0) {
      this.modalOpenSubject.next(false);
      this.unlockBodyScroll();
    }
  }

  /**
   * Check if any modal is currently open
   */
  isModalOpen(): boolean {
    return this.modalCount > 0;
  }

  /**
   * Lock body scrolling
   */
  private lockBodyScroll(): void {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
      // Prevent scroll on mobile devices
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    }
  }

  /**
   * Unlock body scrolling
   */
  private unlockBodyScroll(): void {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    }
  }
}

