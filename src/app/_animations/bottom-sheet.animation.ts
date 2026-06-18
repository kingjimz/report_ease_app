import {
  animate,
  group,
  query,
  style,
  transition,
  trigger,
} from '@angular/animations';

// Slide-down + fade-out when a bottom-sheet modal closes.
//
// Open (slide-up / fade-in) stays driven by the existing CSS keyframes
// (.app-sheet-up / .app-sheet-fade), which run on insertion. CSS can't animate
// the close because *ngIf removes the element instantly — so this trigger only
// defines the :leave transition, which Angular plays before detaching the node.
//
// Bind [@bottomSheet] on the element toggled by *ngIf (or on the modal
// component host). The queries cover both the shared bottom-sheet classes and
// the daily-mission sheet's own classes, so one trigger fits every modal.
export const bottomSheet = trigger('bottomSheet', [
  transition(':leave', [
    group([
      query(
        '.app-sheet-fade, .mission-fade',
        [animate('220ms ease-in', style({ opacity: 0 }))],
        { optional: true },
      ),
      query(
        '.app-sheet-up, .mission-sheet',
        [
          animate(
            '300ms cubic-bezier(0.32, 0.72, 0, 1)',
            style({ transform: 'translateY(100%)' }),
          ),
        ],
        { optional: true },
      ),
    ]),
  ]),
]);
