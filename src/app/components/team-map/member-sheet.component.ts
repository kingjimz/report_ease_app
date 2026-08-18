import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GeoService, LatLng, TravelProfile } from '../../_services/geo.service';
import { SharedLocation } from '../../_services/location-sharing.service';
import { avatarColorFor } from '../../_utils/avatar';
import { ModalComponent } from '../modal/modal.component';

/**
 * Pick a group member, then get directions to them. Two views in one sheet,
 * following the same pattern as GroupSheetComponent:
 *
 *   list   -> everyone currently sharing, tapped from the map's Directions button
 *   detail -> travel mode + actions, reached from the list or straight from a pin
 *
 * Presentation only. It emits an intent and the map does the routing, which
 * keeps all the Leaflet and quota logic in one place.
 */
@Component({
  selector: 'app-member-sheet',
  standalone: true,
  imports: [CommonModule, ModalComponent],
  template: `
    <app-modal (dismissed)="closed.emit()">
      <div class="w-full">
        <!-- Header. Back only exists when there is a list to go back to. -->
        <div class="flex items-center gap-2 mb-3 pb-3 border-b border-gray-200">
          <button
            *ngIf="selected && cameFromList"
            type="button"
            (click)="selectedUid = null"
            aria-label="Back to members"
            class="shrink-0 flex items-center justify-center w-8 h-8 -ml-1 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <i class="bi bi-chevron-left"></i>
          </button>
          <div
            *ngIf="!selected"
            class="flex items-center justify-center w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg shrink-0"
          >
            <i class="bi bi-signpost-2 text-white text-base"></i>
          </div>
          <div
            *ngIf="selected as target"
            class="relative flex items-center justify-center w-9 h-9 rounded-full overflow-hidden shrink-0 border-2 border-white shadow"
            [style.background]="colorFor(target.uid)"
          >
            <img
              *ngIf="target.photoURL && !photoFailed"
              [src]="target.photoURL"
              referrerpolicy="no-referrer"
              alt=""
              class="w-full h-full object-cover"
              (error)="photoFailed = true"
            />
            <span *ngIf="!target.photoURL || photoFailed" class="text-sm font-semibold text-white">
              {{ initialFor(target) }}
            </span>
          </div>
          <div class="min-w-0 flex-1">
            <h3 class="text-base font-semibold text-gray-800 truncate">
              {{ selected ? selected.displayName : 'Get directions' }}
            </h3>
            <p class="text-xs text-gray-500 truncate">
              {{ selected ? subtitleFor(selected) : 'Pick who you want to travel to' }}
            </p>
          </div>
        </div>

        <!-- LIST -->
        <ng-container *ngIf="!selected">
          <ul *ngIf="members.length" class="mb-1 -mx-1">
            <li *ngFor="let m of members">
              <button
                type="button"
                (click)="select(m)"
                class="w-full flex items-center gap-3 px-1 py-2.5 text-left rounded-lg hover:bg-gray-50 transition-colors"
              >
                <span
                  class="relative flex items-center justify-center w-9 h-9 rounded-full overflow-hidden shrink-0 border-2 border-white shadow"
                  [style.background]="colorFor(m.uid)"
                >
                  <img
                    *ngIf="m.photoURL"
                    [src]="m.photoURL"
                    referrerpolicy="no-referrer"
                    alt=""
                    class="w-full h-full object-cover"
                  />
                  <span *ngIf="!m.photoURL" class="text-sm font-semibold text-white">
                    {{ initialFor(m) }}
                  </span>
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-medium text-gray-800 truncate">
                    {{ m.displayName }}
                  </span>
                  <span class="block text-xs text-gray-500 truncate">{{ subtitleFor(m) }}</span>
                </span>
                <i class="bi bi-chevron-right text-gray-400 shrink-0"></i>
              </button>
            </li>
          </ul>

          <p *ngIf="!members.length" class="py-6 text-sm text-center text-gray-500">
            No one in this group is sharing their location right now.
          </p>
        </ng-container>

        <!-- DETAIL -->
        <ng-container *ngIf="selected as target">
          <div class="flex gap-2 p-1 mb-3 bg-gray-100 rounded-lg">
            <button
              type="button"
              (click)="mode = 'walk'"
              [attr.aria-pressed]="mode === 'walk'"
              class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors"
              [ngClass]="mode === 'walk' ? 'bg-emerald-600 text-white shadow' : 'text-gray-600'"
            >
              <i class="bi bi-person-walking"></i>Walk
            </button>
            <button
              type="button"
              (click)="mode = 'drive'"
              [attr.aria-pressed]="mode === 'drive'"
              class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors"
              [ngClass]="mode === 'drive' ? 'bg-emerald-600 text-white shadow' : 'text-gray-600'"
            >
              <i class="bi bi-car-front-fill"></i>Drive
            </button>
          </div>

          <button
            type="button"
            (click)="navigate.emit({ uid: target.uid, profile: mode })"
            [disabled]="!canRoute"
            class="w-full px-4 py-2.5 mb-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:hover:bg-emerald-600 transition-colors"
          >
            <i class="bi bi-signpost-2 mr-1"></i>Directions
          </button>

          <button
            type="button"
            (click)="centerOn.emit(target.uid)"
            class="w-full px-4 py-2.5 mb-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <i class="bi bi-crosshair mr-1"></i>Center on map
          </button>

          <!-- Escape hatch that costs no routing quota and always works. -->
          <a
            [href]="googleMapsUrlFor(target)"
            target="_blank"
            rel="noopener"
            class="block w-full px-4 py-2 text-center text-xs font-medium text-gray-500 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <i class="bi bi-box-arrow-up-right mr-1"></i>Open in Google Maps
          </a>

          <p *ngIf="!canRoute" class="mt-2 text-xs text-amber-700 text-center">
            In-app directions are unavailable right now. Google Maps still works.
          </p>
        </ng-container>
      </div>
    </app-modal>
  `,
})
export class MemberSheetComponent implements OnInit {
  /** Everyone routable: sharing, fresh, and not the viewer. */
  @Input() members: SharedLocation[] = [];
  /** Set when opened from a pin, so the sheet skips straight to the detail view. */
  @Input() initialUid: string | null = null;
  /** The owner's own position, for the straight-line distance line. */
  @Input() myPosition: LatLng | null = null;
  /** Remembered travel mode, so the choice sticks between openings. */
  @Input() profile: TravelProfile = 'walk';

  @Output() closed = new EventEmitter<void>();
  @Output() navigate = new EventEmitter<{ uid: string; profile: TravelProfile }>();
  @Output() centerOn = new EventEmitter<string>();

  selectedUid: string | null = null;
  mode: TravelProfile = 'walk';
  photoFailed = false;
  /** Opened from the list, so a back button makes sense. */
  cameFromList = true;

  constructor(private geo: GeoService) {}

  ngOnInit(): void {
    this.mode = this.profile;
    this.selectedUid = this.initialUid;
    this.cameFromList = !this.initialUid;
  }

  /** Resolved from the live list, so the sheet tracks position updates. */
  get selected(): SharedLocation | null {
    if (!this.selectedUid) return null;
    return this.members.find((m) => m.uid === this.selectedUid) ?? null;
  }

  get canRoute(): boolean {
    return this.geo.canRoute();
  }

  select(member: SharedLocation): void {
    this.photoFailed = false;
    this.selectedUid = member.uid;
  }

  colorFor(uid: string): string {
    return avatarColorFor(uid);
  }

  initialFor(member: SharedLocation): string {
    return (member.displayName || '?').charAt(0).toUpperCase();
  }

  /** How recent the fix is, plus straight-line distance as a lower bound. */
  subtitleFor(member: SharedLocation): string {
    const mins = Math.floor((Date.now() - member.updatedAt.getTime()) / 60_000);
    const when = mins < 1 ? 'just now' : mins === 1 ? '1 min ago' : `${mins} min ago`;
    if (!this.myPosition) return `Updated ${when}`;
    const away = this.geo.formatDistance(this.geo.distanceKm(this.myPosition, member));
    return `Updated ${when} · ${away}`;
  }

  googleMapsUrlFor(member: SharedLocation): string {
    const travel = this.mode === 'walk' ? 'walking' : 'driving';
    return (
      `https://www.google.com/maps/dir/?api=1` +
      `&destination=${member.lat},${member.lng}&travelmode=${travel}`
    );
  }
}
