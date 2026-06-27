import {
  Component,
  Input,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import { GeoService, LatLng, RouteStep } from '../../_services/geo.service';
import { addBaseLayers } from '../../_utils/leaflet-layers';
import { teleportToBody, restoreFromBody } from '../../_utils/fullscreen';

/**
 * Read-only Leaflet map for the study details view. Shows the saved pin and a
 * distance label. Tapping "Directions" draws the driving route AND starts live
 * in-app navigation: a moving "you" dot, a decreasing remaining distance/ETA,
 * an on-screen turn-by-turn banner, and optional spoken guidance.
 *
 * Note: a browser/PWA can't match a native nav app for sustained background GPS,
 * screen-on, and accuracy. This is a best-effort in-app experience.
 */
@Component({
  selector: 'app-location-map',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      #fsHost
      [ngClass]="
        isFullscreen
          ? 'fixed inset-0 z-[10050] flex flex-col bg-white'
          : 'rounded-lg overflow-hidden border border-gray-200'
      "
    >
      <div class="relative" [ngClass]="isFullscreen ? 'flex-1 min-h-0' : ''">
        <div
          #mapEl
          class="w-full bg-gray-100"
          [ngClass]="isFullscreen ? 'h-full' : 'h-48'"
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

      <!-- Turn-by-turn guidance banner (while navigating) -->
      <div
        *ngIf="navigating"
        class="flex items-center gap-3 px-3 py-2 bg-emerald-600 text-white"
      >
        <i class="bi {{ nextIcon }} text-2xl shrink-0"></i>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold truncate">
            {{ nextInstruction || 'Starting…' }}
          </p>
          <p *ngIf="nextDistanceLabel" class="text-xs opacity-90">
            in {{ nextDistanceLabel }}
          </p>
        </div>
        <button
          type="button"
          (click)="toggleVoice()"
          [title]="voiceOn ? 'Mute voice' : 'Unmute voice'"
          class="flex items-center justify-center w-8 h-8 rounded-md bg-white/20 hover:bg-white/30 transition-colors shrink-0"
        >
          <i class="bi" [ngClass]="voiceOn ? 'bi-volume-up' : 'bi-volume-mute'"></i>
        </button>
      </div>

      <div
        class="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border-t border-gray-200"
      >
        <span class="text-xs font-medium text-gray-600 truncate">
          <i class="bi bi-signpost-2 text-emerald-600 mr-1"></i>
          {{ remainingLabel || routeLabel || distanceLabel || 'Pinned location' }}
        </span>
        <button
          *ngIf="!routeShown"
          type="button"
          (click)="showRoute()"
          [disabled]="routing"
          class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 transition-colors disabled:opacity-50 shrink-0"
        >
          <span
            *ngIf="routing"
            class="animate-spin rounded-full h-3 w-3 border-t-2 border-white inline-block"
          ></span>
          <i *ngIf="!routing" class="bi bi-signpost-split"></i>
          {{ routing ? 'Routing…' : 'Directions' }}
        </button>
        <button
          *ngIf="routeShown"
          type="button"
          (click)="clearRoute()"
          class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors shrink-0"
        >
          <i class="bi bi-x-lg"></i>
          Stop
        </button>
      </div>
      <p *ngIf="routeError" class="px-3 pb-2 text-xs text-amber-600">
        {{ routeError }}
      </p>
    </div>
  `,
})
export class LocationMapComponent implements AfterViewInit, OnDestroy {
  @Input() location!: LatLng;
  /** e.g. "2.3 km away" or a hint when location is off. */
  @Input() distanceLabel: string | null = null;

  @ViewChild('mapEl') mapEl!: ElementRef<HTMLDivElement>;
  @ViewChild('fsHost') fsHost!: ElementRef<HTMLElement>;

  /** Road distance + ETA when the route first loads, e.g. "3.2 km • 8 min drive". */
  routeLabel: string | null = null;
  /** Live remaining distance + ETA while navigating, e.g. "1.4 km • 4 min left". */
  remainingLabel: string | null = null;
  routing = false;
  routeShown = false;
  routeError: string | null = null;
  isFullscreen = false;

  // Live navigation banner
  navigating = false;
  nextInstruction: string | null = null;
  nextDistanceLabel: string | null = null;
  nextIcon = 'bi-arrow-up';
  voiceOn = true;

  private map?: L.Map;
  private routeLayers: L.Layer[] = [];
  private youMarker?: L.CircleMarker;

  // Route data kept for live progress calculations.
  private routePath: LatLng[] = [];
  private cumDist: number[] = []; // km from start to each routePath index
  private steps: RouteStep[] = [];
  private avgKmPerMin = 0;

  private watchId: number | null = null;
  private firstFix = true;
  private spokenStepWayPoint = -1;
  private fsPlaceholder: Comment | null = null;

  constructor(private geo: GeoService) {}

  /**
   * Expand/collapse the map to fill the screen. The map lives inside a
   * transformed bottom-sheet modal, so we teleport it to <body> while
   * fullscreen — otherwise `fixed` stays bound to the sheet and the modal
   * scrolls/drags underneath. Then resize + recenter Leaflet.
   */
  toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;
    if (this.isFullscreen) {
      this.map?.scrollWheelZoom.enable();
      this.fsPlaceholder = teleportToBody(this.fsHost.nativeElement);
    } else {
      this.map?.scrollWheelZoom.disable();
      restoreFromBody(this.fsHost.nativeElement, this.fsPlaceholder);
      this.fsPlaceholder = null;
    }
    setTimeout(() => {
      this.map?.invalidateSize();
      this.recenter();
    }, 60);
  }

  /**
   * Keep the relevant content in view after a resize: follow the user while
   * navigating, fit the whole route if one is drawn, else center on the pin.
   */
  private recenter(): void {
    if (!this.map) return;
    if (this.navigating && this.youMarker) {
      this.map.setView(this.youMarker.getLatLng(), Math.max(this.map.getZoom(), 16));
      return;
    }
    const line = this.routeLayers.find((l) => l instanceof L.Polyline) as
      | L.Polyline
      | undefined;
    if (line) this.map.fitBounds(line.getBounds(), { padding: [30, 30] });
    else this.map.setView([this.location.lat, this.location.lng], 16);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isFullscreen) this.toggleFullscreen();
  }

  ngAfterViewInit(): void {
    this.map = L.map(this.mapEl.nativeElement, {
      center: [this.location.lat, this.location.lng],
      zoom: 16,
      zoomControl: true,
      dragging: true,
      scrollWheelZoom: false,
    });

    addBaseLayers(this.map, 'street');

    L.marker([this.location.lat, this.location.lng], {
      icon: pinIcon(),
    }).addTo(this.map);

    // Modal animates in; container may have zero size on first paint.
    setTimeout(() => {
      this.map?.invalidateSize();
      this.recenter();
    }, 250);
  }

  /**
   * Fetch + draw the driving route, then start live navigation. Triggered by
   * the Directions button. Surfaces a short reason when it can't.
   */
  async showRoute(): Promise<void> {
    if (this.routing || this.routeShown) return;
    this.routeError = null;

    if (!this.geo.canRoute()) {
      this.routeError = 'Routing isn’t set up yet.';
      return;
    }
    if (!this.geo.isLocationEnabled()) {
      this.routeError = 'Turn on location to see the route.';
      return;
    }

    this.routing = true;
    try {
      const from = await this.geo.getCurrentCoords();
      const route = await this.geo.getRoute(from, this.location);
      if (!route || !this.map) {
        this.routeError = 'Could not find a route to this pin.';
        return;
      }

      // "You are here" dot (kept as a reference so it can move live).
      this.youMarker = L.circleMarker([from.lat, from.lng], {
        radius: 7,
        color: '#1d4ed8',
        fillColor: '#3b82f6',
        fillOpacity: 1,
        weight: 3,
      }).addTo(this.map);

      // ORS snaps route ends to the nearest road; anchor the drawn line to the
      // real start/pin so it visibly joins both markers (Google-style connector).
      const points: [number, number][] = [
        [from.lat, from.lng],
        ...route.path.map((p) => [p.lat, p.lng] as [number, number]),
        [this.location.lat, this.location.lng],
      ];
      const line = L.polyline(points, {
        color: '#059669',
        weight: 5,
        opacity: 0.8,
      }).addTo(this.map);

      this.routeLayers = [this.youMarker, line];
      this.map.fitBounds(line.getBounds(), { padding: [30, 30] });
      this.routeLabel =
        `${this.geo.formatDistance(route.distanceKm).replace(' away', '')}` +
        ` • ${this.geo.formatDuration(route.durationMin)} drive`;
      this.routeShown = true;

      // Prepare live-progress data and begin tracking.
      this.routePath = route.path;
      this.steps = route.steps;
      this.avgKmPerMin =
        route.durationMin > 0 ? route.distanceKm / route.durationMin : 0;
      this.buildCumulativeDistances();
      this.startTracking();
    } catch {
      this.routeError = 'Could not get your current location.';
    } finally {
      this.routing = false;
    }
  }

  /** Stop navigation, remove the route, and recenter on the pin. */
  clearRoute(): void {
    this.stopTracking();
    this.routeLayers.forEach((l) => this.map?.removeLayer(l));
    this.routeLayers = [];
    this.youMarker = undefined;
    this.routeShown = false;
    this.navigating = false;
    this.routeLabel = null;
    this.remainingLabel = null;
    this.nextInstruction = null;
    this.nextDistanceLabel = null;
    this.routeError = null;
    this.firstFix = true;
    this.spokenStepWayPoint = -1;
    this.map?.setView([this.location.lat, this.location.lng], 16);
  }

  toggleVoice(): void {
    this.voiceOn = !this.voiceOn;
    if (!this.voiceOn) this.cancelSpeech();
  }

  ngOnDestroy(): void {
    this.stopTracking();
    this.cancelSpeech();
    // If closed while fullscreen, make sure body scroll is unlocked.
    if (this.isFullscreen) {
      restoreFromBody(this.fsHost.nativeElement, this.fsPlaceholder);
    }
    this.map?.remove();
  }

  /* --------------------------- live tracking --------------------------- */

  private startTracking(): void {
    if (!('geolocation' in navigator)) return;
    this.navigating = true;
    this.watchId = navigator.geolocation.watchPosition(
      (pos) =>
        this.onPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      () => {
        /* keep last known state on transient GPS errors */
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
  }

  private stopTracking(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  /** Update the moving dot, remaining distance/ETA, and the next maneuver. */
  private onPosition(cur: LatLng): void {
    if (!this.map || !this.routePath.length) return;

    this.youMarker?.setLatLng([cur.lat, cur.lng]);
    if (this.firstFix) {
      this.firstFix = false;
      this.map.setView([cur.lat, cur.lng], 17);
    } else {
      this.map.panTo([cur.lat, cur.lng], { animate: true });
    }

    const idx = this.nearestIndex(cur);
    const offRoute = this.geo.distanceKm(cur, this.routePath[idx]);
    const total = this.cumDist[this.cumDist.length - 1] || 0;
    const remainingKm = Math.max(0, total - this.cumDist[idx]) + offRoute;

    // Arrived within ~40 m of the pin.
    if (remainingKm < 0.04) {
      this.remainingLabel = 'Arrived';
      this.nextInstruction = 'You have arrived';
      this.nextIcon = 'bi-geo-alt-fill';
      this.nextDistanceLabel = null;
      this.speakOnce(Number.MAX_SAFE_INTEGER, 'You have arrived');
      this.stopTracking();
      return;
    }

    const remainingMin =
      this.avgKmPerMin > 0 ? remainingKm / this.avgKmPerMin : 0;
    this.remainingLabel =
      `${this.geo.formatShort(remainingKm)}` +
      ` • ${this.geo.formatDuration(remainingMin)} left`;

    // Next maneuver: the first step whose point is ahead of us.
    const step =
      this.steps.find((s) => s.wayPoint > idx) ??
      this.steps[this.steps.length - 1];
    if (step) {
      const toManeuverKm =
        Math.max(0, (this.cumDist[step.wayPoint] ?? total) - this.cumDist[idx]) +
        offRoute;
      this.nextInstruction = step.instruction || 'Continue';
      this.nextIcon = this.geo.maneuverIcon(step.type);
      this.nextDistanceLabel = this.geo.formatShort(toManeuverKm);
      this.speakOnce(step.wayPoint, step.instruction);
    }
  }

  /** Index of the route point nearest to `cur`. */
  private nearestIndex(cur: LatLng): number {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.routePath.length; i++) {
      const d = this.geo.distanceKm(cur, this.routePath[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  private buildCumulativeDistances(): void {
    this.cumDist = [];
    let total = 0;
    for (let i = 0; i < this.routePath.length; i++) {
      if (i > 0) {
        total += this.geo.distanceKm(this.routePath[i - 1], this.routePath[i]);
      }
      this.cumDist[i] = total;
    }
  }

  /* ------------------------------- voice ------------------------------- */

  // Speak an instruction only once per maneuver (keyed by its wayPoint).
  private speakOnce(key: number, text: string): void {
    if (!this.voiceOn || !text) return;
    if (key === this.spokenStepWayPoint) return;
    this.spokenStepWayPoint = key;
    this.speak(text);
  }

  private speak(text: string): void {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }

  private cancelSpeech(): void {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
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
