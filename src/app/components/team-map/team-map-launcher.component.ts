import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { LocationSharingService } from '../../_services/location-sharing.service';
import { ModalService } from '../../_services/modal.service';
import { NavigationService } from '../../_services/navigation.service';
import { TeamMapComponent } from './team-map.component';

/**
 * Floating entry point for the team map: a button stacked directly above the
 * chat launcher, opening the map as a full-viewport overlay.
 *
 * Deliberately dumb -- it owns the button, the overlay shell, and dismissal.
 * Everything about the map itself lives in TeamMapComponent.
 */
@Component({
  selector: 'app-team-map-launcher',
  standalone: true,
  imports: [CommonModule, TeamMapComponent],
  template: `
    <!-- Sits one step below the chat widget (z-9990) so an open chat panel
         covers it. The two buttons never overlap each other, so their relative
         order doesn't matter; the panel's footprint is what does. -->
    <button
      *ngIf="!open"
      type="button"
      (click)="openMap()"
      aria-label="Open team map"
      [ngClass]="barVisible ? 'bottom-[10.5rem]' : 'bottom-24'"
      class="fixed right-4 z-[9989] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg transition-all duration-300 hover:scale-105 active:scale-95"
    >
      <i class="bi bi-geo-alt-fill text-2xl"></i>
      <!-- Live dot while this device is broadcasting. -->
      <span
        *ngIf="sharingSvc.sharing()"
        class="share-dot absolute right-1 top-1 h-3 w-3 rounded-full border-2 border-white bg-red-500"
      ></span>
    </button>

    <!-- No overflow-hidden: the consent modal inside renders as a full-viewport
         child and would be clipped. No transform either -- a transformed
         ancestor breaks position:fixed for that modal. -->
    <div
      *ngIf="open"
      class="fixed inset-0 z-[100000] flex flex-col overscroll-contain bg-white pb-[env(safe-area-inset-bottom)]"
    >
      <app-team-map class="flex-1 min-h-0" (closed)="close()"></app-team-map>
    </div>
  `,
  styles: [
    `
      .share-dot {
        animation: share-dot-pulse 2s ease-in-out infinite;
      }
      @keyframes share-dot-pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.35;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .share-dot {
          animation: none;
        }
      }
    `,
  ],
})
export class TeamMapLauncherComponent implements OnInit, OnDestroy {
  open = false;
  /** Mirrors the bottom tab bar so the button rides up/down with it. */
  barVisible = true;

  private barSub?: Subscription;
  /** Set while our own history entry is on the stack. */
  private pushedHistory = false;

  constructor(
    public sharingSvc: LocationSharingService,
    private navigation: NavigationService,
    private modalService: ModalService,
  ) {}

  ngOnInit(): void {
    this.barSub = this.navigation.tabBarVisible$.subscribe(
      (visible) => (this.barVisible = visible),
    );
  }

  ngOnDestroy(): void {
    this.barSub?.unsubscribe();
    // Intentionally not unwinding pushedHistory here: this component is
    // destroyed on logout, and a history.back() would fight the router's own
    // redirect to /login. A stale entry just makes one back press a no-op.
  }

  openMap(): void {
    this.open = true;
    // A full-viewport overlay should answer to the Android back button;
    // without this, back exits the PWA instead of closing the map.
    history.pushState({ mapOverlay: true }, '');
    this.pushedHistory = true;
  }

  /** Dismiss from the map's own close button, or from Escape. */
  close(): void {
    if (!this.open) return;
    if (this.pushedHistory) {
      // Unwinding our entry fires popstate, which lands on closeImmediate().
      history.back();
      return;
    }
    this.closeImmediate();
  }

  @HostListener('window:popstate')
  onPopState(): void {
    this.pushedHistory = false;
    this.closeImmediate();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    // The consent modal is [dismissible]="false" on purpose -- don't rip the
    // overlay out from under a decision the user hasn't made yet.
    if (this.modalService.isModalOpen()) return;
    this.close();
  }

  private closeImmediate(): void {
    this.open = false;
  }

  // No body-scroll lock here on purpose. Three incompatible locks already
  // exist (ModalService, the chat widget, _utils/fullscreen), and the consent
  // modal's own lock would unlock the body out from under a fourth on close.
  // The overlay is opaque and fixed, so overscroll-contain is enough.
}
