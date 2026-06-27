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
import * as L from 'leaflet';
import { GeoService, LatLng } from '../../_services/geo.service';
import { addBaseLayers } from '../../_utils/leaflet-layers';

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
  imports: [CommonModule],
  template: `
    <div
      [ngClass]="
        isFullscreen
          ? 'fixed inset-0 z-[10000] flex flex-col bg-white'
          : 'rounded-lg overflow-hidden border border-gray-300'
      "
    >
      <div class="relative" [ngClass]="isFullscreen ? 'flex-1 min-h-0' : ''">
        <div
          #mapEl
          class="w-full bg-gray-100"
          [ngClass]="isFullscreen ? 'h-full' : 'h-56'"
        ></div>
        <button
          type="button"
          (click)="toggleFullscreen()"
          [title]="isFullscreen ? 'Exit full screen' : 'Full screen'"
          class="absolute top-2 right-2 z-[1200] flex items-center justify-center w-8 h-8 bg-white/90 text-gray-700 rounded-md shadow hover:bg-white transition-colors"
        >
          <i
            [class]="
              isFullscreen ? 'bi bi-fullscreen-exit' : 'bi bi-arrows-fullscreen'
            "
          ></i>
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

  locating = false;
  hasPin = false;
  isFullscreen = false;

  private map?: L.Map;
  private marker?: L.Marker;

  // Default center when no pin yet and current location is unavailable.
  private readonly fallbackCenter: LatLng = { lat: 14.5995, lng: 120.9842 };

  constructor(private geo: GeoService) {}

  /** Expand/collapse the picker to fill the screen, then resize + recenter. */
  toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;
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
    this.map?.remove();
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
      <path d="M16 0C7.7 0 1 6.7 1 15c0 10.5 13.2 23.5 13.8 24.1a1.7 1.7 0 0 0 2.4 0C17.8 38.5 31 25.5 31 15 31 6.7 24.3 0 16 0z" fill="#059669"/>
      <circle cx="16" cy="15" r="6" fill="#ffffff"/>
    </svg>`,
    iconSize: [32, 40],
    iconAnchor: [16, 40],
  });
}
