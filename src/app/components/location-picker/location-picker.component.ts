import {
  Component,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import { GeoService, LatLng } from '../../_services/geo.service';
import { addBaseLayers } from '../../_utils/leaflet-layers';
import { teleportToBody, restoreFromBody } from '../../_utils/fullscreen';

/** Payload emitted whenever the user moves the pin. */
export interface PickedLocation {
  location: LatLng;
  /** Reverse-geocoded address string, or null if lookup failed. */
  address: string | null;
}

/**
 * Reusable Leaflet map for picking a location. The user taps the map or drags
 * the marker to place a pin, or taps "Use my current location" to drop the pin
 * on their GPS position. Every change emits coords + a reverse-geocoded address
 * so the parent form can auto-fill its address field.
 *
 * Uses an inline SVG divIcon for the marker to sidestep Leaflet's broken
 * default-marker asset paths under the Angular bundler (no image assets needed).
 */
@Component({
  selector: 'app-location-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div
      #fsHost
      [ngClass]="
        isFullscreen
          ? 'fixed inset-0 z-[100000] flex flex-col bg-white'
          : 'rounded-lg overflow-hidden border border-gray-300'
      "
    >
      <!-- Search to quickly locate a study's address. -->
      <div class="relative bg-white border-b border-gray-200">
        <div class="flex items-center gap-2 p-2">
          <input
            type="text"
            [(ngModel)]="searchQuery"
            (keydown.enter)="search(); $event.preventDefault()"
            name="locationSearch"
            placeholder="Search address or place…"
            class="flex-1 min-w-0 py-1.5 px-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <button
            type="button"
            (click)="search()"
            [disabled]="searching || !searchQuery.trim()"
            class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            <span
              *ngIf="searching"
              class="animate-spin rounded-full h-3 w-3 border-t-2 border-white inline-block"
            ></span>
            <i *ngIf="!searching" class="bi bi-search"></i>
            Search
          </button>
        </div>
        <ul
          *ngIf="searchResults.length"
          class="absolute z-[1300] left-2 right-2 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto"
        >
          <li
            *ngFor="let r of searchResults"
            (click)="selectResult(r)"
            class="px-3 py-2 text-xs text-gray-700 hover:bg-emerald-50 cursor-pointer border-b border-gray-100 last:border-0"
          >
            <i class="bi bi-geo-alt text-emerald-600 mr-1"></i>{{ r.label }}
          </li>
        </ul>
        <p *ngIf="searchedEmpty" class="px-3 pb-2 text-xs text-gray-400">
          No matches. Try a broader place name.
        </p>
      </div>
      <div class="relative" [ngClass]="isFullscreen ? 'flex-1 min-h-0' : ''">
        <div
          #mapEl
          class="w-full bg-gray-100"
          [ngClass]="isFullscreen ? 'h-full' : 'h-56'"
        ></div>
        <button
          type="button"
          (click)="toggleFullscreen()"
          [title]="isFullscreen ? 'Close full screen' : 'Full screen'"
          [ngClass]="
            isFullscreen
              ? 'gap-1.5 px-3 h-9 bg-red-600 text-white hover:bg-red-700'
              : 'w-8 h-8 bg-white/90 text-gray-700 hover:bg-white'
          "
          class="absolute top-2 right-2 z-[1200] flex items-center justify-center rounded-md shadow transition-colors text-sm font-semibold"
        >
          <i
            [class]="
              isFullscreen ? 'bi bi-fullscreen-exit' : 'bi bi-arrows-fullscreen'
            "
          ></i>
          <span *ngIf="isFullscreen">Close</span>
        </button>
      </div>
      <div
        class="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border-t border-gray-200"
      >
        <span class="text-xs text-gray-500 truncate">
          <ng-container *ngIf="hasPin; else noPin">
            <i class="bi bi-geo-alt-fill text-emerald-600 mr-1"></i>Pin placed
          </ng-container>
          <ng-template #noPin>
            <i class="bi bi-info-circle mr-1"></i>Tap the map to drop a pin
          </ng-template>
        </span>
        <button
          type="button"
          (click)="useCurrentLocation()"
          [disabled]="locating"
          class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-100 rounded-md hover:bg-emerald-200 transition-colors disabled:opacity-50"
        >
          <span
            *ngIf="locating"
            class="animate-spin rounded-full h-3 w-3 border-t-2 border-emerald-700 inline-block"
          ></span>
          <i *ngIf="!locating" class="bi bi-crosshair"></i>
          {{ locating ? 'Locating…' : 'Use my location' }}
        </button>
      </div>
    </div>
  `,
})
export class LocationPickerComponent implements AfterViewInit, OnDestroy {
  /** Existing pin to show when editing a record. */
  @Input() location: LatLng | null = null;
  @Output() locationChange = new EventEmitter<PickedLocation>();

  @ViewChild('mapEl') mapEl!: ElementRef<HTMLDivElement>;
  @ViewChild('fsHost') fsHost!: ElementRef<HTMLElement>;

  locating = false;
  hasPin = false;
  isFullscreen = false;

  // Address search state
  searchQuery = '';
  searching = false;
  searchedEmpty = false;
  searchResults: Array<{ lat: number; lng: number; label: string }> = [];

  private map?: L.Map;
  private marker?: L.Marker;
  private fsPlaceholder: Comment | null = null;

  // Default center when no pin yet and current location is unavailable.
  private readonly fallbackCenter: LatLng = { lat: 14.5995, lng: 120.9842 };

  constructor(private geo: GeoService) {}

  /**
   * Expand/collapse the picker to fill the screen. It lives inside a transformed
   * bottom-sheet modal, so we teleport it to <body> while fullscreen — otherwise
   * `fixed` stays bound to the sheet and the modal scrolls/drags underneath.
   */
  toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;
    if (this.isFullscreen) {
      this.fsPlaceholder = teleportToBody(this.fsHost.nativeElement);
    } else {
      restoreFromBody(this.fsHost.nativeElement, this.fsPlaceholder);
      this.fsPlaceholder = null;
    }
    setTimeout(() => {
      this.map?.invalidateSize();
      this.recenterOnPin();
    }, 60);
  }

  /** Keep the pin in view: center the map on the current marker, if any. */
  private recenterOnPin(): void {
    if (this.map && this.marker) {
      this.map.setView(this.marker.getLatLng(), this.map.getZoom() || 16);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isFullscreen) this.toggleFullscreen();
  }

  ngAfterViewInit(): void {
    const center = this.location ?? this.fallbackCenter;
    this.map = L.map(this.mapEl.nativeElement, {
      center: [center.lat, center.lng],
      zoom: this.location ? 16 : 12,
      attributionControl: true,
    });

    addBaseLayers(this.map, 'satellite');

    this.map.on('click', (e: L.LeafletMouseEvent) => {
      this.setPin({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    if (this.location) {
      this.placeMarker(this.location);
    } else if (this.geo.isLocationEnabled()) {
      // New record: auto-drop a draggable pin at the user's current location and
      // emit it, so the record gets a location by default. The user can drag it
      // to fine-tune before saving.
      this.geo
        .getCurrentCoords()
        .then((c) => {
          this.map?.setView([c.lat, c.lng], 16);
          this.setPin(c);
        })
        .catch(() => {});
    }

    // The modal animates in, so the container may have zero size on first paint.
    // Resize once it's visible, then recenter so the pin is always in view.
    setTimeout(() => {
      this.map?.invalidateSize();
      this.recenterOnPin();
    }, 250);
  }

  ngOnDestroy(): void {
    // If closed while fullscreen, make sure body scroll is unlocked.
    if (this.isFullscreen) {
      restoreFromBody(this.fsHost.nativeElement, this.fsPlaceholder);
    }
    this.map?.remove();
  }

  async search(): Promise<void> {
    if (!this.searchQuery.trim()) return;
    this.searching = true;
    this.searchedEmpty = false;
    this.searchResults = await this.geo.forwardGeocode(this.searchQuery);
    this.searchedEmpty = this.searchResults.length === 0;
    this.searching = false;
  }

  // Pick a search result: fly the map there, drop the pin, emit with the
  // result's label as the address (no extra reverse-geocode needed).
  selectResult(r: { lat: number; lng: number; label: string }): void {
    this.searchResults = [];
    this.searchedEmpty = false;
    this.searchQuery = r.label;
    const coords: LatLng = { lat: r.lat, lng: r.lng };
    this.map?.setView([coords.lat, coords.lng], 16);
    this.placeMarker(coords);
    this.locationChange.emit({ location: coords, address: r.label });
  }

  async useCurrentLocation(): Promise<void> {
    this.locating = true;
    try {
      const coords = await this.geo.getCurrentCoords();
      this.map?.setView([coords.lat, coords.lng], 16);
      this.setPin(coords);
    } catch (err) {
      console.warn('Could not get current location:', err);
    }
    this.locating = false;
  }

  /** Place/move the pin and emit the change with a reverse-geocoded address. */
  private async setPin(coords: LatLng): Promise<void> {
    this.placeMarker(coords);
    const address = await this.geo.reverseGeocode(coords.lat, coords.lng);
    this.locationChange.emit({ location: coords, address });
  }

  private placeMarker(coords: LatLng): void {
    this.hasPin = true;
    if (!this.map) return;
    if (this.marker) {
      this.marker.setLatLng([coords.lat, coords.lng]);
      return;
    }
    this.marker = L.marker([coords.lat, coords.lng], {
      draggable: true,
      icon: pinIcon(),
    }).addTo(this.map);
    this.marker.on('dragend', () => {
      const ll = this.marker!.getLatLng();
      this.setPin({ lat: ll.lat, lng: ll.lng });
    });
  }
}

/** Inline SVG pin so we don't depend on Leaflet's bundled image assets. */
function pinIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 0C7.7 0 1 6.7 1 15c0 10.5 13.2 23.5 13.8 24.1a1.7 1.7 0 0 0 2.4 0C17.8 38.5 31 25.5 31 15 31 6.7 24.3 0 16 0z" fill="#dc2626"/>
      <circle cx="16" cy="15" r="6" fill="#ffffff"/>
    </svg>`,
    iconSize: [32, 40],
    iconAnchor: [16, 40],
  });
}
