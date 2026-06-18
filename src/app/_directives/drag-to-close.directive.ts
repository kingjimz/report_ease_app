import {
  Directive,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';

/**
 * Drag-to-dismiss for bottom-sheet modals on touch devices.
 *
 * Apply to the sheet panel element. A downward drag that STARTS while the
 * content is scrolled to the top moves the sheet with the finger; release past
 * the threshold emits (dismissed) so the parent can close it, otherwise the
 * sheet snaps back. Any other gesture is left untouched, so normal scrolling of
 * the modal content keeps working.
 *
 * Enable/disable via the bound value: `[appDragToClose]="dismissible"`. Used as
 * a bare attribute it defaults to enabled.
 */
@Directive({
  selector: '[appDragToClose]',
  standalone: true,
})
export class DragToCloseDirective implements OnInit, OnDestroy {
  @Input('appDragToClose') set enabledInput(value: boolean | '') {
    // Bare attribute (`appDragToClose`) arrives as '' → treat as enabled.
    this.enabled = value === '' || value === true || value === undefined;
  }
  @Output() dismissed = new EventEmitter<void>();

  private enabled = true;
  private readonly el: HTMLElement;
  private scrollEl: HTMLElement | null = null;

  private startY = 0;
  private currentY = 0;
  private dragging = false;
  private decided = false; // gesture classified as drag-close vs. scroll

  private readonly startSlop = 6; // px before we classify the gesture
  private readonly closeThreshold = 110; // px pulled down to dismiss

  constructor(elRef: ElementRef<HTMLElement>, private zone: NgZone) {
    this.el = elRef.nativeElement;
  }

  ngOnInit(): void {
    // The scrollable region is an inner container for the shared modal, or the
    // panel itself for the simpler sheets. Fall back to the panel either way.
    this.scrollEl =
      (this.el.querySelector(
        '.overflow-y-auto, .overflow-y-scroll',
      ) as HTMLElement) || this.el;

    // Listen outside Angular so finger moves don't trigger change detection.
    this.zone.runOutsideAngular(() => {
      this.el.addEventListener('touchstart', this.onTouchStart, {
        passive: true,
      });
      this.el.addEventListener('touchmove', this.onTouchMove, {
        passive: false,
      });
      this.el.addEventListener('touchend', this.onTouchEnd, { passive: true });
      this.el.addEventListener('touchcancel', this.onTouchEnd, {
        passive: true,
      });
    });
  }

  ngOnDestroy(): void {
    this.el.removeEventListener('touchstart', this.onTouchStart);
    this.el.removeEventListener('touchmove', this.onTouchMove);
    this.el.removeEventListener('touchend', this.onTouchEnd);
    this.el.removeEventListener('touchcancel', this.onTouchEnd);
  }

  private onTouchStart = (e: TouchEvent): void => {
    if (!this.enabled || e.touches.length !== 1) return;
    this.startY = this.currentY = e.touches[0].clientY;
    this.dragging = false;
    this.decided = false;
    this.el.style.transition = 'none';
  };

  private onTouchMove = (e: TouchEvent): void => {
    if (!this.enabled || e.touches.length !== 1) return;
    this.currentY = e.touches[0].clientY;
    const delta = this.currentY - this.startY;

    if (!this.decided) {
      const atTop = !this.scrollEl || this.scrollEl.scrollTop <= 0;
      if (delta > this.startSlop && atTop) {
        this.dragging = true;
        this.decided = true;
      } else if (Math.abs(delta) > this.startSlop) {
        // Scrolling up, or not at the top: hand the gesture back to the scroller.
        this.decided = true;
        this.dragging = false;
      }
    }

    if (this.dragging) {
      // Stop the content from scrolling while we drag the sheet.
      e.preventDefault();
      this.el.style.transform = `translateY(${Math.max(0, delta)}px)`;
    }
  };

  private onTouchEnd = (): void => {
    if (!this.dragging) return;
    this.dragging = false;
    const delta = Math.max(0, this.currentY - this.startY);

    if (delta > this.closeThreshold) {
      // Clear the inline transition and let the parent close it; the modal's
      // :leave animation continues the slide from the current drag position.
      this.el.style.transition = '';
      this.zone.run(() => this.dismissed.emit());
    } else {
      // Snap back into place.
      this.el.style.transition =
        'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)';
      this.el.style.transform = 'translateY(0)';
    }
  };
}
