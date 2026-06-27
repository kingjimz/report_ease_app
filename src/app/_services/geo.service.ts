import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { SettingsService } from './settings.service';
import { environment } from '../../environments/environment';

/** A geographic coordinate pair stored on a study/return-visit record. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** A single turn-by-turn maneuver along a route. */
export interface RouteStep {
  /** Human instruction, e.g. "Turn left onto Rizal Street". */
  instruction: string;
  /** Road/street name for this step. */
  name: string;
  /** Length of this step in metres. */
  distanceM: number;
  /** ORS maneuver type code (used to pick a direction icon). */
  type: number | null;
  /** Index into RouteResult.path where this maneuver happens. */
  wayPoint: number;
}

/** A drivable route between two points, for the in-app route line. */
export interface RouteResult {
  /** Ordered points of the route path, for drawing a polyline. */
  path: LatLng[];
  /** Road distance in km. */
  distanceKm: number;
  /** Estimated driving time in minutes. */
  durationMin: number;
  /** Turn-by-turn steps for in-app guidance (empty if unavailable). */
  steps: RouteStep[];
}

/**
 * Shared geolocation helper for the map-pinning feature. Mirrors the proven
 * no-key approach used by weather.service.ts (browser geolocation +
 * bigdatacloud reverse geocode) so we stay consistent and key-free.
 */
@Injectable({ providedIn: 'root' })
export class GeoService {
  constructor(
    private http: HttpClient,
    private settings: SettingsService,
  ) {}

  /** Whether the user has allowed location use (shared with weather). */
  isLocationEnabled(): boolean {
    return this.settings.isLocationEnabled();
  }

  /**
   * Resolve the device's current position via the browser. Same options as
   * weather.service.ts so behaviour (accuracy, timeout) matches.
   */
  getCurrentCoords(): Promise<LatLng> {
    return new Promise<LatLng>((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        reject(new Error('Geolocation unsupported'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 10 * 60 * 1000 },
      );
    });
  }

  /**
   * Turn coordinates into a human-readable address string for auto-fill.
   * Uses the free, no-key bigdatacloud endpoint (same as weather.service.ts).
   * Returns null on failure so callers degrade gracefully.
   */
  async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    try {
      const url =
        `https://api.bigdatacloud.net/data/reverse-geocode-client` +
        `?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
      const res: any = await firstValueFrom(this.http.get(url));
      const parts = [
        res?.locality || res?.city,
        res?.principalSubdivision,
        res?.countryName,
      ].filter(Boolean);
      // De-dupe consecutive repeats (e.g. city === locality).
      const unique = parts.filter((p, i) => p !== parts[i - 1]);
      return unique.length ? unique.join(', ') : null;
    } catch {
      return null;
    }
  }

  /**
   * Great-circle distance between two points in kilometres (Haversine).
   */
  distanceKm(a: LatLng, b: LatLng): number {
    const R = 6371; // Earth radius, km
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /** Whether a route line can be fetched (needs the Worker /route URL set). */
  canRoute(): boolean {
    return !!environment.routeApiUrl;
  }

  /**
   * Driving route between two points. Calls our Cloudflare Worker /route
   * endpoint, which proxies OpenRouteService using a server-side key (so no key
   * ships in this bundle). Returns the path + road distance + ETA for the
   * in-app route line, or null on any failure so the map degrades to the
   * straight-line distance.
   */
  async getRoute(from: LatLng, to: LatLng): Promise<RouteResult | null> {
    if (!environment.routeApiUrl) return null;
    try {
      const res: any = await firstValueFrom(
        this.http.post(environment.routeApiUrl, { from, to }),
      );
      if (!Array.isArray(res?.path) || !res.path.length) return null;
      return {
        path: res.path as LatLng[],
        distanceKm: res.distanceKm,
        durationMin: res.durationMin,
        steps: Array.isArray(res.steps) ? (res.steps as RouteStep[]) : [],
      };
    } catch {
      return null;
    }
  }

  /**
   * Bootstrap-icon class for an ORS maneuver type, so the guidance banner can
   * show a left/right/straight arrow. Falls back to a straight arrow.
   */
  maneuverIcon(type: number | null): string {
    switch (type) {
      case 0: // left
      case 2: // sharp left
      case 4: // slight left
      case 12: // keep left
        return 'bi-arrow-left';
      case 1: // right
      case 3: // sharp right
      case 5: // slight right
      case 13: // keep right
        return 'bi-arrow-right';
      case 7: // enter roundabout
      case 8: // exit roundabout
        return 'bi-arrow-clockwise';
      case 9: // u-turn
        return 'bi-arrow-return-left';
      case 10: // goal / arrive
        return 'bi-geo-alt-fill';
      default: // straight, depart, unknown
        return 'bi-arrow-up';
    }
  }

  /** Format a short distance to a maneuver: "120 m" or "1.4 km". */
  formatShort(km: number): string {
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${km.toFixed(1)} km`;
  }

  /** Format a driving time: "8 min" or "1 h 12 min". */
  formatDuration(min: number): string {
    const total = Math.round(min);
    if (total < 60) return `${total} min`;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }

  /** Format a km distance for display: "850 m away" or "2.3 km away". */
  formatDistance(km: number): string {
    if (km < 1) {
      return `${Math.round(km * 1000)} m away`;
    }
    if (km < 10) {
      return `${km.toFixed(1)} km away`;
    }
    return `${Math.round(km)} km away`;
  }
}
