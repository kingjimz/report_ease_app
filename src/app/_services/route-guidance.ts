import { signal } from '@angular/core';
import { GeoService, LatLng, RouteResult, RouteStep, TravelProfile } from './geo.service';

/**
 * Live turn-by-turn guidance along an already-fetched route.
 *
 * Deliberately a plain class rather than an `@Injectable`: every field here is
 * per-map state (the path, the cumulative distances, the GPS watch, the spoken
 * maneuver cursor). A root singleton would make two open maps fight over one
 * watch and one voice cursor. A component `new`s this in `ngAfterViewInit` and
 * calls `destroy()` in `ngOnDestroy`.
 *
 * It does three things and nothing else: track progress, decide when a reroute
 * is worth spending a request on, and speak maneuvers. It never fetches routes,
 * owns Leaflet layers, or moves the map. Those stay with the host component,
 * which is what lets two very different maps share this engine.
 */

/** Arrival radius. Below this we stop tracking and declare the trip done. */
const ARRIVE_KM = 0.04;

/**
 * Windowed nearest-point search. A full scan per GPS fix is O(path length),
 * and paths get refetched often when the destination moves, so we look near
 * the last match first and only fall back to a full scan when that window
 * clearly does not contain us any more.
 */
const WINDOW_BACK = 20;
const WINDOW_FORWARD = 80;
const WINDOW_MISS_KM = 0.15;

/** Reroute policy: drift from the anchor, behind a hard time floor. */
const MIN_REROUTE_MS = 30_000;
const DRIFT_KM: Record<TravelProfile, number> = { drive: 0.25, walk: 0.15 };
const OFF_ROUTE_KM = 0.06;
const OFF_ROUTE_FIXES = 2;
const NO_REROUTE_BELOW_KM = 0.05;
/** Circuit breaker: a single session cannot spend more than this many routes. */
const MAX_REROUTES = 40;

export interface GuidanceState {
  navigating: boolean;
  arrived: boolean;
  /** Next maneuver text, e.g. "Turn left onto Rizal Street". */
  instruction: string | null;
  /** Distance to that maneuver, e.g. "120 m". */
  nextDistanceLabel: string | null;
  /** Bootstrap-icon class for the maneuver arrow. */
  icon: string;
  /** Live remaining distance + ETA. */
  remainingLabel: string | null;
  remainingKm: number;
  offRouteKm: number;
  nearestIdx: number;
  /** True once the reroute breaker has tripped: the line may be out of date. */
  stale: boolean;
}

const EMPTY: GuidanceState = {
  navigating: false,
  arrived: false,
  instruction: null,
  nextDistanceLabel: null,
  icon: 'bi-arrow-up',
  remainingLabel: null,
  remainingKm: 0,
  offRouteKm: 0,
  nearestIdx: 0,
  stale: false,
};

export interface GuidanceHooks {
  /** Called on every fix so the host can move its dot and pan the map. */
  onFix?: (cur: LatLng, state: GuidanceState, firstFix: boolean) => void;
  onArrive?: () => void;
}

/** Minimal shape of the Screen Wake Lock API, which TS's DOM lib omits. */
interface WakeLockish {
  released: boolean;
  release(): Promise<void>;
}

export class RouteGuidance {
  readonly state = signal<GuidanceState>(EMPTY);
  voiceOn = true;

  /** Route data kept for live progress calculations. */
  private routePath: LatLng[] = [];
  private cumDist: number[] = []; // km from start to each routePath index
  private steps: RouteStep[] = [];
  private avgKmPerMin = 0;

  /**
   * Where the target actually is right now, which for a moving destination is
   * ahead of where the route was computed to. The gap is added to the remaining
   * distance so the ETA stays honest between reroutes.
   */
  private dest: LatLng | null = null;
  private tailKm = 0;

  /** Reroute bookkeeping. */
  private routeAnchor: LatLng | null = null;
  private lastRouteAt = 0;
  private rerouteCount = 0;
  private forceReroute = false;
  private offRouteStreak = 0;

  private watchId: number | null = null;
  private firstFix = true;
  private lastIdx = 0;
  private spokenStepWayPoint = -1;
  private wakeLock: WakeLockish | null = null;
  private readonly onVisibility = () => this.syncWakeLock();

  constructor(
    private geo: GeoService,
    private hooks: GuidanceHooks = {},
  ) {}

  /* ------------------------------- setup -------------------------------- */

  /**
   * Adopt a freshly fetched route. `to` is the destination it was computed for,
   * which becomes the anchor future drift is measured against.
   */
  setRoute(route: RouteResult, to: LatLng): void {
    this.routePath = route.path;
    this.steps = route.steps;
    this.avgKmPerMin = route.durationMin > 0 ? route.distanceKm / route.durationMin : 0;
    this.buildCumulativeDistances();
    this.lastIdx = 0;
    this.spokenStepWayPoint = -1;
    this.offRouteStreak = 0;
    this.routeAnchor = { ...to };
    this.dest = { ...to };
    this.tailKm = 0;
    this.lastRouteAt = Date.now();
    this.rerouteCount++;
    this.forceReroute = false;
  }

  /**
   * Move the destination without spending a request. The drawn line still ends
   * at the old anchor, so the leftover leg is folded into the remaining
   * distance and the host draws a dashed connector over it.
   */
  setDestination(to: LatLng): void {
    this.dest = { ...to };
    const last = this.routePath[this.routePath.length - 1];
    this.tailKm = last ? this.geo.distanceKm(last, to) : 0;
  }

  /** The leftover leg between the drawn line and the live target, in km. */
  get tailDistanceKm(): number {
    return this.tailKm;
  }

  /** Force the next shouldReroute check to pass, e.g. after a profile change. */
  requestReroute(): void {
    this.forceReroute = true;
  }

  /**
   * Whether the drift from the anchor now justifies another routing call.
   * Every branch sits behind a hard 30s floor, because the inbound position
   * stream is far faster than the routing quota can absorb.
   */
  shouldReroute(dest: LatLng, profile: TravelProfile): boolean {
    if (!this.routeAnchor || !this.routePath.length) return false;

    const s = this.state();
    if (s.arrived) return false;

    if (this.rerouteCount > MAX_REROUTES) {
      if (!s.stale) this.state.set({ ...s, stale: true });
      return false;
    }
    if (Date.now() - this.lastRouteAt < MIN_REROUTE_MS) return false;
    if (this.forceReroute) return true;

    // Close enough to cover the last stretch by eye; rerouting here just churns.
    if (s.remainingKm > 0 && s.remainingKm <= NO_REROUTE_BELOW_KM) return false;

    if (this.geo.distanceKm(this.routeAnchor, dest) >= DRIFT_KM[profile]) return true;
    return this.offRouteStreak >= OFF_ROUTE_FIXES;
  }

  /* ----------------------------- tracking ------------------------------- */

  /**
   * Begin guidance. Pass `ownWatch: false` when the host already has a GPS
   * watch running (LocationSharingService does while sharing is on) and will
   * push fixes in through feed(), so the device is not asked for two watches.
   */
  start(opts: { ownWatch?: boolean } = {}): void {
    this.firstFix = true;
    this.state.set({ ...EMPTY, navigating: true });
    this.acquireWakeLock();
    document.addEventListener('visibilitychange', this.onVisibility);

    if (opts.ownWatch !== false) this.useOwnWatch(true);
  }

  /**
   * Take over or hand back the fix stream mid-session, without disturbing
   * progress. The host borrows LocationSharingService's watch while sharing is
   * on; if the user turns sharing off mid-trip that stream stops, and guidance
   * would silently stall without this.
   */
  useOwnWatch(on: boolean): void {
    if (!on) {
      this.stopWatch();
      return;
    }
    if (this.watchId !== null || !('geolocation' in navigator)) return;
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.feed({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        /* keep last known state on transient GPS errors */
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
  }

  stop(): void {
    this.stopWatch();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.releaseWakeLock();
    this.cancelSpeech();
    this.routePath = [];
    this.cumDist = [];
    this.steps = [];
    this.dest = null;
    this.routeAnchor = null;
    this.tailKm = 0;
    this.rerouteCount = 0;
    this.forceReroute = false;
    this.offRouteStreak = 0;
    this.spokenStepWayPoint = -1;
    this.state.set(EMPTY);
  }

  destroy(): void {
    this.stop();
  }

  private stopWatch(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  /** Update remaining distance/ETA and the next maneuver from one GPS fix. */
  feed(cur: LatLng): void {
    if (!this.routePath.length) return;
    const prev = this.state();
    if (prev.arrived) return;

    const idx = this.nearestIndex(cur);
    const offRoute = this.geo.distanceKm(cur, this.routePath[idx]);
    this.offRouteStreak = offRoute > OFF_ROUTE_KM ? this.offRouteStreak + 1 : 0;

    const total = this.cumDist[this.cumDist.length - 1] || 0;
    const remainingKm = Math.max(0, total - this.cumDist[idx]) + offRoute + this.tailKm;
    const toDest = this.dest ? this.geo.distanceKm(cur, this.dest) : remainingKm;

    // Arrived. Measured against the live target as well as the drawn line, so a
    // destination that walked toward us still counts.
    if (Math.min(remainingKm, toDest) < ARRIVE_KM) {
      this.state.set({
        ...prev,
        navigating: true,
        arrived: true,
        remainingLabel: 'Arrived',
        instruction: 'You have arrived',
        icon: 'bi-geo-alt-fill',
        nextDistanceLabel: null,
        remainingKm: 0,
        offRouteKm: offRoute,
        nearestIdx: idx,
      });
      this.speakOnce(Number.MAX_SAFE_INTEGER, 'You have arrived');
      this.stopWatch();
      this.releaseWakeLock();
      this.hooks.onFix?.(cur, this.state(), false);
      this.hooks.onArrive?.();
      return;
    }

    const remainingMin = this.avgKmPerMin > 0 ? remainingKm / this.avgKmPerMin : 0;
    const next: GuidanceState = {
      ...prev,
      navigating: true,
      arrived: false,
      remainingLabel:
        this.geo.formatShort(remainingKm) + ' • ' + this.geo.formatDuration(remainingMin) + ' left',
      remainingKm,
      offRouteKm: offRoute,
      nearestIdx: idx,
    };

    // Next maneuver: the first step whose point is ahead of us.
    const step = this.steps.find((s) => s.wayPoint > idx) ?? this.steps[this.steps.length - 1];
    if (step) {
      const toManeuverKm =
        Math.max(0, (this.cumDist[step.wayPoint] ?? total) - this.cumDist[idx]) + offRoute;
      next.instruction = step.instruction || 'Continue';
      next.icon = this.geo.maneuverIcon(step.type);
      next.nextDistanceLabel = this.geo.formatShort(toManeuverKm);
    }

    this.state.set(next);
    if (step) this.speakOnce(step.wayPoint, step.instruction);

    const wasFirst = this.firstFix;
    this.firstFix = false;
    this.hooks.onFix?.(cur, next, wasFirst);
  }

  /* ------------------------------- math -------------------------------- */

  /** Index of the route point nearest to `cur`, searched near the last match. */
  private nearestIndex(cur: LatLng): number {
    const n = this.routePath.length;
    if (!n) return 0;

    const lo = Math.max(0, this.lastIdx - WINDOW_BACK);
    const hi = Math.min(n - 1, this.lastIdx + WINDOW_FORWARD);
    let best = lo;
    let bestD = Infinity;
    for (let i = lo; i <= hi; i++) {
      const d = this.geo.distanceKm(cur, this.routePath[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }

    // The window lost us: a wrong turn, a reroute, or a resumed session.
    if (bestD > WINDOW_MISS_KM && (lo > 0 || hi < n - 1)) {
      for (let i = 0; i < n; i++) {
        const d = this.geo.distanceKm(cur, this.routePath[i]);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }

    this.lastIdx = best;
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

  toggleVoice(): void {
    this.voiceOn = !this.voiceOn;
    if (!this.voiceOn) this.cancelSpeech();
  }

  /** Speak an instruction only once per maneuver (keyed by its wayPoint). */
  private speakOnce(key: number, text: string): void {
    if (!this.voiceOn || !text) return;
    if (key === this.spokenStepWayPoint) return;
    this.spokenStepWayPoint = key;
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }

  private cancelSpeech(): void {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  /* ----------------------------- wake lock ----------------------------- */

  /**
   * Keep the screen awake while navigating. Without this the OS suspends
   * watchPosition on a locked phone, which is exactly when someone is walking
   * with the app in their pocket. The browser drops the lock whenever the page
   * is hidden, so it is re-acquired on visibility change.
   */
  private acquireWakeLock(): void {
    const nav = navigator as Navigator & {
      wakeLock?: { request(type: 'screen'): Promise<WakeLockish> };
    };
    if (!nav.wakeLock || this.wakeLock) return;
    nav.wakeLock
      .request('screen')
      .then((lock) => (this.wakeLock = lock))
      .catch(() => {
        /* denied or unsupported: navigation still works, the screen may sleep */
      });
  }

  private releaseWakeLock(): void {
    const lock = this.wakeLock;
    this.wakeLock = null;
    if (lock && !lock.released) lock.release().catch(() => undefined);
  }

  private syncWakeLock(): void {
    if (document.hidden) this.releaseWakeLock();
    else if (this.state().navigating && !this.state().arrived) this.acquireWakeLock();
  }
}
