import {
  Component,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  EventEmitter,
  HostListener,
  Output,
  ViewChild,
  effect,
  Injector,
  runInInjectionContext,
  untracked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import 'leaflet-rotate';
import { Auth } from '@angular/fire/auth';
import { LocationSharingService, SharedLocation } from '../../_services/location-sharing.service';
import { GroupsService, GroupMember } from '../../_services/groups.service';
import { addBaseLayers } from '../../_utils/leaflet-layers';
import { ModalComponent } from '../modal/modal.component';
import { GroupSheetComponent } from './group-sheet.component';

// Staleness thresholds: fresh pins are full color, quiet ones fade, and
// anything older than HIDE_MS is removed (the sharer's app is closed).
const FADE_MS = 5 * 60 * 1000;
const HIDE_MS = 15 * 60 * 1000;
const CONSENT_KEY = 'liveShareConsented';

/**
 * Group map: shows everyone in the active group who has opted into sharing.
 * Fills its host, which TeamMapLauncherComponent renders as a full-viewport
 * overlay. The collection listener only runs while the overlay is open (the
 * component is destroyed on close), and staleness is re-evaluated on a timer
 * so pins age even when no new snapshots arrive.
 */
@Component({
  selector: 'app-team-map',
  standalone: true,
  imports: [CommonModule, ModalComponent, GroupSheetComponent],
  template: `
    <div class="flex flex-col flex-1 min-h-0 bg-white">
      <!-- Header: close + count + toggle. Inset for the status bar because the
           launcher renders this edge-to-edge (index.html sets viewport-fit=cover). -->
      <div
        class="shrink-0 flex items-center gap-3 px-4 pb-3 border-b border-gray-200"
        style="padding-top: calc(0.75rem + env(safe-area-inset-top, 0px))"
      >
        <button
          type="button"
          (click)="closed.emit()"
          aria-label="Close map"
          class="shrink-0 flex items-center justify-center w-8 h-8 -ml-1 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <i class="bi bi-x-lg"></i>
        </button>
        <div class="min-w-0 flex-1">
          <button
            type="button"
            (click)="showGroups = true"
            aria-label="Switch group"
            class="flex items-center gap-1.5 max-w-full text-sm font-semibold text-gray-800 rounded-md hover:bg-gray-100 transition-colors"
          >
            <i class="bi bi-geo-alt-fill text-emerald-600 shrink-0"></i>
            <span class="truncate">{{ groupsSvc.activeGroup()?.name || 'No group' }}</span>
            <i class="bi bi-chevron-down text-xs text-gray-400 shrink-0"></i>
          </button>
          <p class="text-xs text-gray-500 truncate">
            <ng-container *ngIf="groupsSvc.activeGroupId(); else noGroupSubtitle">
              {{ visibleCount }} sharing · {{ groupsSvc.members().length }} members
            </ng-container>
            <ng-template #noGroupSubtitle>Tap to create or join a group</ng-template>
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-label="Share my location"
          [attr.aria-checked]="sharingSvc.sharing()"
          (click)="onToggleShare()"
          class="flex items-center gap-2 shrink-0"
        >
          <span
            class="text-xs font-medium"
            [class.text-emerald-700]="sharingSvc.sharing()"
            [class.text-gray-500]="!sharingSvc.sharing()"
          >
            {{ sharingSvc.sharing() ? 'Sharing' : 'Share my location' }}
          </span>
          <span
            class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
            [ngClass]="sharingSvc.sharing() ? 'bg-emerald-600' : 'bg-gray-300'"
          >
            <span
              class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
              [ngClass]="sharingSvc.sharing() ? 'translate-x-6' : 'translate-x-1'"
            ></span>
          </span>
        </button>
      </div>
      <p
        *ngIf="sharingSvc.error() || groupsSvc.error()"
        class="shrink-0 px-4 py-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-100"
      >
        <i class="bi bi-exclamation-triangle mr-1"></i>{{ sharingSvc.error() || groupsSvc.error() }}
      </p>

      <!-- Map. 'isolate' pens in Leaflet's panes (z 400-800) so they can't
           escape into the surrounding stacking context. -->
      <div class="relative isolate flex-1 min-h-0">
        <div #mapEl class="absolute inset-0 bg-gray-100"></div>
        <button
          type="button"
          (click)="recenter()"
          title="Show everyone"
          class="absolute bottom-6 right-2 z-[1200] flex items-center justify-center w-8 h-8 bg-white/90 text-gray-700 hover:bg-white rounded-md shadow transition-colors"
        >
          <i class="bi bi-people-fill"></i>
        </button>
        <!-- No group yet: the map is meaningless until you are in one. -->
        <div
          *ngIf="!groupsSvc.activeGroupId()"
          class="absolute inset-x-0 bottom-0 z-[1100] px-4 py-3 bg-white/95 text-center"
        >
          <p class="mb-2 text-xs text-gray-600">
            Groups keep your location private. Only people you share the code with can see you.
          </p>
          <button
            type="button"
            (click)="showGroups = true"
            class="px-4 py-2 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
          >
            Create or join a group
          </button>
        </div>

        <!-- In a group, but nobody is broadcasting. -->
        <div
          *ngIf="groupsSvc.activeGroupId() && visibleCount === 0"
          class="absolute inset-x-0 bottom-0 z-[1100] px-4 py-2 bg-white/90 text-center"
        >
          <p class="text-xs text-gray-600">
            No one in this group is sharing right now.
            {{
              sharingSvc.sharing()
                ? 'Your pin will appear shortly.'
                : 'Turn on sharing to appear here.'
            }}
          </p>
        </div>
      </div>
    </div>

    <!-- Group switcher / management -->
    <app-group-sheet *ngIf="showGroups" (closed)="showGroups = false"></app-group-sheet>

    <!-- One-time consent modal -->
    <app-modal *ngIf="showConsent" [dismissible]="false">
      <div class="w-full">
        <div class="flex items-center gap-2 mb-3 pb-3 border-b border-gray-200">
          <div
            class="flex items-center justify-center w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg shrink-0"
          >
            <i class="bi bi-geo-alt-fill text-white text-base"></i>
          </div>
          <h3 class="text-base font-semibold text-gray-800">Share your live location?</h3>
        </div>
        <p class="text-sm text-gray-600 mb-2">
          While this app is open, your live position and name (or the first part of your email) will
          be visible to everyone in
          <span class="font-medium text-gray-800">{{
            groupsSvc.activeGroup()?.name || 'this group'
          }}</span
          >. No one outside the group can see you.
        </p>
        <p class="text-sm text-gray-600 mb-4">
          Nothing is shared when the app is closed or when this is turned off. Turning it off also
          removes your location completely.
        </p>
        <div class="flex gap-2">
          <button
            type="button"
            (click)="declineConsent()"
            class="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Not now
          </button>
          <button
            type="button"
            (click)="acceptConsent()"
            class="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
          >
            Share my location
          </button>
        </div>
      </div>
    </app-modal>
  `,
  styles: [
    `
      /* Fill whatever the host gives us; the map div is absolutely positioned
         inside a flex child, so there's no percentage-height chain to break. */
      :host {
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      /* Smooth slide between position updates; suspended during zoom so the
         transition doesn't fight Leaflet's own zoom transforms. */
      :host ::ng-deep .team-pin {
        transition: transform 1s linear;
      }
      :host ::ng-deep .team-pin-nozoom {
        transition: none;
      }
      /* Pulsing halo behind my own pin. */
      :host ::ng-deep .me-pulse {
        position: absolute;
        top: -7px;
        left: -7px;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background: rgba(37, 99, 235, 0.25);
        animation: me-pulse 2s ease-out infinite;
      }
      @keyframes me-pulse {
        0% {
          transform: scale(0.6);
          opacity: 0.9;
        }
        70% {
          transform: scale(1.4);
          opacity: 0;
        }
        100% {
          opacity: 0;
        }
      }
    `,
  ],
})
export class TeamMapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapEl') mapEl!: ElementRef<HTMLDivElement>;

  /** Asks the host to dismiss the map. */
  @Output() closed = new EventEmitter<void>();

  showConsent = false;
  showGroups = false;
  visibleCount = 0;

  private map?: L.Map;
  private markers = new Map<string, L.Marker>();
  private meMarker?: L.Marker;
  private didFitBounds = false;
  private didCenterOnMe = false;
  private ageTimer?: ReturnType<typeof setInterval>;
  private resizeObserver?: ResizeObserver;
  private zooming = false;

  constructor(
    public sharingSvc: LocationSharingService,
    public groupsSvc: GroupsService,
    private auth: Auth,
    private injector: Injector,
  ) {}

  ngAfterViewInit(): void {
    this.map = L.map(this.mapEl.nativeElement, {
      center: [0, 0],
      zoom: 2,
      zoomControl: true,
      dragging: true,
      scrollWheelZoom: true,
      // The page behind is not scroll-locked, so damp the wheel: at Leaflet's
      // default a single trackpad flick blows through several zoom levels.
      wheelPxPerZoomLevel: 120,
      rotate: true,
      touchRotate: true,
      bearing: 0,
    } as L.MapOptions);
    addBaseLayers(this.map, 'street');

    // Marker slide transitions clash with zoom animation transforms.
    this.map.on('zoomstart', () => this.setZooming(true));
    this.map.on('zoomend', () => this.setZooming(false));

    this.sharingSvc.startListening();
    // The roster is only worth a listener while the map is on screen; it drives
    // the member count, the manage sheet, and the pin filter below.
    this.groupsSvc.startMembersListening();
    runInInjectionContext(this.injector, () => {
      // Depends on the roster too, so a removal clears the pin immediately
      // rather than waiting for the position doc to age out.
      effect(() => this.renderMarkers(this.sharingSvc.locations(), this.groupsSvc.members()));
      // My own pin follows the raw GPS feed: appears instantly on opt-in and
      // moves on every fix, ahead of the throttled Firestore writes.
      effect(() => this.renderMeMarker(this.sharingSvc.myPosition()));
      // A group switch swaps out every pin, so start over on framing.
      effect(() => {
        this.groupsSvc.activeGroupId();
        untracked(() => this.resetFraming());
      });
    });
    // Re-age pins even when no snapshots arrive.
    this.ageTimer = setInterval(
      () => this.renderMarkers(this.sharingSvc.locations(), this.groupsSvc.members()),
      60_000,
    );

    // Covers first paint plus everything that resizes a full-screen map later:
    // rotation, the iOS URL bar collapsing, the on-screen keyboard.
    this.resizeObserver = new ResizeObserver(() =>
      requestAnimationFrame(() => this.map?.invalidateSize()),
    );
    this.resizeObserver.observe(this.mapEl.nativeElement);
  }

  ngOnDestroy(): void {
    this.sharingSvc.stopListening();
    this.groupsSvc.stopMembersListening();
    if (this.ageTimer) clearInterval(this.ageTimer);
    this.resizeObserver?.disconnect();
    this.map?.remove();
  }

  /**
   * The launcher's own Escape handler stands down while a modal is open, so the
   * group sheet has to answer for itself or Escape would do nothing.
   */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showGroups) this.showGroups = false;
  }

  /** Drop every pin and re-frame; used when the group underneath changes. */
  private resetFraming(): void {
    for (const marker of this.markers.values()) marker.remove();
    this.markers.clear();
    this.didFitBounds = false;
    this.visibleCount = 0;
  }

  onToggleShare(): void {
    if (this.sharingSvc.sharing()) {
      this.sharingSvc.stopSharing();
      return;
    }
    // Nothing to share into yet - send them to pick a group instead of asking
    // for GPS permission that would have nowhere to go.
    if (!this.groupsSvc.activeGroupId()) {
      this.showGroups = true;
      return;
    }
    if (localStorage.getItem(CONSENT_KEY) === 'true') {
      this.sharingSvc.startSharing();
    } else {
      this.showConsent = true;
    }
  }

  acceptConsent(): void {
    localStorage.setItem(CONSENT_KEY, 'true');
    this.showConsent = false;
    this.sharingSvc.startSharing();
  }

  declineConsent(): void {
    this.showConsent = false;
  }

  recenter(): void {
    if (!this.map) return;
    const points = [...this.markers.values()].map((m) => m.getLatLng());
    if (this.meMarker) points.push(this.meMarker.getLatLng());
    if (points.length === 0) return;
    this.map.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 16 });
  }

  /* ------------------------------ rendering ------------------------------ */

  private renderMarkers(locations: SharedLocation[], members: GroupMember[]): void {
    if (!this.map) return;
    const now = Date.now();
    const seen = new Set<string>();
    let visible = 0;

    // Defence in depth against a position doc outliving its member doc (a
    // removal that only half-landed, say). The rules already stop the writes;
    // this stops the stale pin from being drawn in the meantime. Skipped while
    // the roster is still loading so pins are not hidden on first paint.
    const roster = members.length > 0 ? new Set(members.map((m) => m.uid)) : null;

    const myUid = this.auth.currentUser?.uid;
    for (const loc of locations) {
      const age = now - loc.updatedAt.getTime();
      if (age > HIDE_MS) continue;
      if (roster && !roster.has(loc.uid)) continue;
      // My pin is drawn live from the GPS feed; drop the snapshot copy so I
      // don't appear twice (still counted as sharing).
      if (loc.uid === myUid && untracked(() => this.sharingSvc.myPosition())) {
        const dup = this.markers.get(loc.uid);
        if (dup) {
          dup.remove();
          this.markers.delete(loc.uid);
        }
        visible++;
        continue;
      }
      seen.add(loc.uid);
      visible++;
      const stale = age > FADE_MS;
      const existing = this.markers.get(loc.uid);
      if (existing) {
        existing.setLatLng([loc.lat, loc.lng]);
        existing.setIcon(this.avatarIcon(loc, stale));
        existing.setTooltipContent(this.lastSeenLabel(loc, age));
      } else {
        const marker = L.marker([loc.lat, loc.lng], { icon: this.avatarIcon(loc, stale) })
          .bindTooltip(this.lastSeenLabel(loc, age), { direction: 'top', offset: [0, -22] })
          .addTo(this.map);
        this.markers.set(loc.uid, marker);
      }
    }

    for (const [uid, marker] of this.markers) {
      if (!seen.has(uid)) {
        marker.remove();
        this.markers.delete(uid);
      }
    }

    // Count me while my first Firestore write is still in flight.
    if (this.meMarker && myUid && !seen.has(myUid) && !locations.some((l) => l.uid === myUid)) {
      visible++;
    }
    this.visibleCount = visible;
    if (!this.didFitBounds && visible > 0) {
      this.didFitBounds = true;
      this.recenter();
    }
  }

  /** My own pin: avatar in a pulsing blue ring, driven by the raw GPS feed. */
  private renderMeMarker(pos: { lat: number; lng: number } | null): void {
    if (!this.map) return;
    if (!pos) {
      this.meMarker?.remove();
      this.meMarker = undefined;
      this.didCenterOnMe = false;
      return;
    }
    // Drop any snapshot copy of my pin right away (no need to wait for the
    // next snapshot pass to dedupe).
    const myUid = this.auth.currentUser?.uid;
    const dup = myUid ? this.markers.get(myUid) : undefined;
    if (dup) {
      dup.remove();
      if (myUid) this.markers.delete(myUid);
    }
    if (this.meMarker) {
      this.meMarker.setLatLng([pos.lat, pos.lng]);
    } else {
      this.meMarker = L.marker([pos.lat, pos.lng], {
        icon: this.meIcon(),
        zIndexOffset: 1000,
      })
        .bindTooltip('You', { direction: 'top', offset: [0, -24] })
        .addTo(this.map);
    }
    // First fix: bring the map to me so I immediately see where I am.
    if (!this.didCenterOnMe) {
      this.didCenterOnMe = true;
      this.map.setView([pos.lat, pos.lng], Math.max(this.map.getZoom(), 16));
    }
  }

  private meIcon(): L.DivIcon {
    const user = this.auth.currentUser;
    const name = user?.displayName || user?.email?.split('@')[0] || 'You';
    const initial = this.escapeHtml(name.charAt(0).toUpperCase());
    const photo = user?.photoURL
      ? `<img src="${this.escapeHtml(user.photoURL)}" referrerpolicy="no-referrer"
           style="width:100%;height:100%;object-fit:cover;border-radius:50%"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
         <span style="display:none;width:100%;height:100%;align-items:center;justify-content:center;
           border-radius:50%;background:#2563eb;color:#fff;font-weight:600;font-size:15px">${initial}</span>`
      : `<span style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;
           border-radius:50%;background:#2563eb;color:#fff;font-weight:600;font-size:15px">${initial}</span>`;
    return L.divIcon({
      className: 'team-pin team-pin-me',
      html: `<div>
        <span class="me-pulse"></span>
        <div style="position:relative;width:36px;height:36px;border-radius:50%;border:2.5px solid #2563eb;
          box-shadow:0 1px 6px rgba(37,99,235,.5);overflow:hidden;background:#fff">${photo}</div>
        <div style="position:relative;margin-top:2px;text-align:center;font-size:10px;font-weight:700;color:#1d4ed8;
          text-shadow:0 0 3px #fff,0 0 3px #fff;white-space:nowrap">You</div>
      </div>`,
      iconSize: [36, 50],
      iconAnchor: [18, 18],
    });
  }

  private lastSeenLabel(loc: SharedLocation, ageMs: number): string {
    const mins = Math.floor(ageMs / 60_000);
    const when = mins < 1 ? 'just now' : mins === 1 ? '1 min ago' : `${mins} min ago`;
    const isMe = loc.uid === this.auth.currentUser?.uid;
    return `${this.escapeHtml(loc.displayName)}${isMe ? ' (you)' : ''} · ${when}`;
  }

  /** 36px avatar circle: photo when available, colored initial otherwise. */
  private avatarIcon(loc: SharedLocation, stale: boolean): L.DivIcon {
    const initial = this.escapeHtml((loc.displayName || '?').charAt(0).toUpperCase());
    const color = this.colorFor(loc.uid);
    const opacity = stale ? 0.5 : 1;
    const photo = loc.photoURL
      ? `<img src="${this.escapeHtml(loc.photoURL)}" referrerpolicy="no-referrer"
           style="width:100%;height:100%;object-fit:cover;border-radius:50%"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
         <span style="display:none;width:100%;height:100%;align-items:center;justify-content:center;
           border-radius:50%;background:${color};color:#fff;font-weight:600;font-size:15px">${initial}</span>`
      : `<span style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;
           border-radius:50%;background:${color};color:#fff;font-weight:600;font-size:15px">${initial}</span>`;
    return L.divIcon({
      className: this.zooming ? 'team-pin team-pin-nozoom' : 'team-pin',
      html: `<div style="opacity:${opacity}">
        <div style="width:36px;height:36px;border-radius:50%;border:2.5px solid #fff;
          box-shadow:0 1px 4px rgba(0,0,0,.35);overflow:hidden;background:#fff">${photo}</div>
        <div style="margin-top:2px;text-align:center;font-size:10px;font-weight:600;color:#111;
          text-shadow:0 0 3px #fff,0 0 3px #fff;white-space:nowrap;max-width:90px;overflow:hidden;
          text-overflow:ellipsis">${this.escapeHtml(loc.displayName)}</div>
      </div>`,
      iconSize: [36, 50],
      iconAnchor: [18, 18],
    });
  }

  private setZooming(zooming: boolean): void {
    this.zooming = zooming;
    const all = [...this.markers.values()];
    if (this.meMarker) all.push(this.meMarker);
    for (const marker of all) {
      const el = marker.getElement();
      if (el) el.classList.toggle('team-pin-nozoom', zooming);
    }
  }

  private colorFor(uid: string): string {
    const palette = ['#059669', '#2563eb', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777'];
    let hash = 0;
    for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) | 0;
    return palette[Math.abs(hash) % palette.length];
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
