import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { SettingsService } from '../../_services/settings.service';
import {
  WeatherService,
  WeatherInfo,
  WeatherScene,
  ClearScene,
  ForecastHour,
  DailyForecast,
  BarangayWeather,
  weatherScene,
  weatherTip,
  describeWeather,
} from '../../_services/weather.service';

@Component({
  selector: 'app-weather-widget',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './weather-widget.component.html',
  styleUrl: './weather-widget.component.css',
})
export class WeatherWidgetComponent implements OnInit, OnDestroy {
  now: Date = new Date();
  weather: WeatherInfo | null = null;
  weatherLoading = true;
  weatherRefreshing = false;
  aiTipText: string | null = null;
  aiTipLoading = false;
  aiTipError = false;
  locationEnabled = true;

  nearbyBarangays: BarangayWeather[] = [];
  nearbyLoading = false;
  /** Name of the currently expanded barangay, or null when all collapsed. */
  expandedBarangay: string | null = null;

  /** Carousel page: 0 = today, 1 = 7-day forecast, 2 = nearby barangays. */
  page = 0;
  private readonly LAST_PAGE = 2;
  /** X coord where the current swipe began (null when not swiping). */
  private touchStartX: number | null = null;

  private clockId: any = null;
  private settingsSub?: Subscription;
  private aiTipTimer: any = null;
  private refreshTimer: any = null;
  /** Treat the AI tip as stuck if it hasn't resolved within this window. */
  private readonly AI_TIP_STUCK_MS = 15000;
  /**
   * How often to check for fresh weather while the dashboard stays open.
   * The service only hits the network once its 15-min cache expires, so polling
   * every 5 min just catches that window promptly without extra calls.
   */
  private readonly REFRESH_POLL_MS = 5 * 60 * 1000;

  constructor(
    private weatherSvc: WeatherService,
    private settings: SettingsService,
  ) {}

  ngOnInit(): void {
    // Live clock, ticking each second.
    this.clockId = setInterval(() => (this.now = new Date()), 1000);

    // React to the location preference (emits the current value immediately).
    this.settingsSub = this.settings.settings$.subscribe((s) => {
      const wasEnabled = this.locationEnabled;
      this.locationEnabled = s.locationEnabled;
      if (this.locationEnabled) {
        // Load on first run or when newly turned on.
        if (!wasEnabled || !this.weather) this.loadWeather();
      } else {
        this.clearWeather();
      }
    });

    // Background auto-refresh while the dashboard stays open.
    this.refreshTimer = setInterval(
      () => this.backgroundRefresh(),
      this.REFRESH_POLL_MS,
    );
  }

  /**
   * Periodic silent refresh: pulls fresh weather (network only when the 15-min
   * cache has expired) and updates the AI tip without flashing the loader.
   */
  private backgroundRefresh(): void {
    if (!this.locationEnabled) return;
    // Mirror the manual refresh indicator, but only when a network pull is
    // genuinely due — a cache hit returns instantly and shouldn't flash it.
    const fetching = this.weatherSvc.isRefreshDue();
    if (fetching) this.weatherRefreshing = true;
    this.weatherSvc
      .getLocationAndWeather()
      .then((info) => {
        if (info) {
          this.weather = info;
          this.refreshAiTip(true);
        }
      })
      .finally(() => {
        if (fetching) this.weatherRefreshing = false;
      });
  }

  /** Turn location on from the widget prompt; the subscription triggers the load. */
  enableLocation(): void {
    this.settings.setLocationEnabled(true);
  }

  /**
   * Force a fresh weather pull on demand, bypassing the 15-minute cache. Spins
   * the refresh icon while in flight, then re-derives the AI tip off the new data.
   */
  manualRefresh(): void {
    if (!this.locationEnabled || this.weatherRefreshing) return;
    this.weatherRefreshing = true;
    this.weatherSvc
      .getLocationAndWeather(true)
      .then((info) => {
        if (info) {
          this.weather = info;
          this.refreshAiTip(true);
          this.loadNearbyBarangays();
        }
      })
      .finally(() => (this.weatherRefreshing = false));
  }

  /** Show cached weather instantly, then refresh in the background. */
  private loadWeather(): void {
    this.weather = this.weatherSvc.getCached();
    this.weatherLoading = !this.weather;
    // If AI tips are enabled, show the loading state up front so the rule-based
    // tip doesn't flash before the AI response arrives.
    this.aiTipLoading = this.weatherSvc.aiEnabled && !!this.weather;
    this.weatherSvc
      .getLocationAndWeather()
      .then((info) => {
        if (info) {
          this.weather = info;
          this.refreshAiTip();
          this.loadNearbyBarangays();
        } else {
          this.aiTipLoading = false;
        }
      })
      .finally(() => (this.weatherLoading = false));
  }

  /** Drop the view state when location is turned off (cache stays in storage). */
  private clearWeather(): void {
    this.weather = null;
    this.weatherLoading = false;
    this.aiTipText = null;
    this.aiTipLoading = false;
    this.aiTipError = false;
    this.nearbyBarangays = [];
  }

  /** Fetch weather for barangays surrounding the user's current location. */
  private loadNearbyBarangays(): void {
    if (!this.weather?.latitude || !this.weather?.longitude) return;
    this.nearbyLoading = true;
    this.weatherSvc
      .fetchNearbyBarangayWeather(
        this.weather.latitude,
        this.weather.longitude,
        this.weather.city,
      )
      .then((results) => (this.nearbyBarangays = results))
      .catch(() => {})
      .finally(() => (this.nearbyLoading = false));
  }

  /** Toggle the expanded detail view for a barangay row. */
  toggleBarangay(name: string): void {
    this.expandedBarangay = this.expandedBarangay === name ? null : name;
  }

  /** Return the next 5 upcoming forecast hours for a barangay. */
  brgyForecast(b: BarangayWeather): ForecastHour[] {
    const now = Date.now();
    return (b.forecast ?? []).filter((h) => h.time > now).slice(0, 5);
  }

  /** Force a fresh AI tip on demand, bypassing the daily cache. */
  reanalyzeTip(): void {
    if (!this.canReanalyze) return;
    this.refreshAiTip(false, true);
  }

  /** Clickable whenever AI is on and a tip isn't already being fetched. */
  get canReanalyze(): boolean {
    return this.weatherSvc.aiEnabled && !this.aiTipLoading;
  }

  /**
   * Ask the AI service for a tip. On null/error/stuck we flag aiTipError so the
   * view shows a clickable re-analyze button; the rule-based tip stays visible.
   */
  private refreshAiTip(silent = false, force = false): void {
    if (!this.weather || !this.weatherSvc.aiEnabled) {
      this.aiTipLoading = false;
      return;
    }

    // Silent (background) refreshes keep the current tip visible instead of
    // flashing the loader; only show loading on the initial load or if no tip yet.
    const showLoading = !silent || !this.aiTipText;

    if (showLoading) {
      this.aiTipLoading = true;
      this.aiTipError = false;
      // Guard against a hung request: surface the retry button if it never resolves.
      clearTimeout(this.aiTipTimer);
      this.aiTipTimer = setTimeout(() => {
        if (this.aiTipLoading) {
          this.aiTipLoading = false;
          this.aiTipError = true;
        }
      }, this.AI_TIP_STUCK_MS);
    }

    const hour = this.now.getHours();
    const partOfDay =
      hour < 6
        ? 'night'
        : hour < 12
        ? 'morning'
        : hour < 18
        ? 'afternoon'
        : 'evening';
    this.weatherSvc
      .getAiTip(this.weather, this.scene, partOfDay, force)
      .then((text) => {
        if (text) {
          this.aiTipText = text;
          this.aiTipError = false;
        } else if (showLoading) {
          // A failed background refresh keeps the existing tip silently.
          this.aiTipError = true;
        }
      })
      .catch(() => {
        if (showLoading) this.aiTipError = true;
      })
      .finally(() => {
        if (showLoading) {
          clearTimeout(this.aiTipTimer);
          this.aiTipLoading = false;
        }
      });
  }

  ngOnDestroy(): void {
    if (this.clockId) clearInterval(this.clockId);
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    clearTimeout(this.aiTipTimer);
    this.settingsSub?.unsubscribe();
  }

  get greeting(): string {
    const hour = this.now.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  /**
   * Animated background scene. The condition comes from the live weather, but
   * day-vs-night tracks the live clock (not the fetched snapshot's is_day, which
   * goes stale in the cache) so the wallpaper turns to night in the evening and
   * back to day in the morning. Falls back to a clear scene when weather is off.
   */
  get scene(): WeatherScene {
    if (this.weather) {
      return weatherScene(this.weather.weatherCode, this.clearScene);
    }
    return this.clearScene;
  }

  /**
   * Clear-sky wallpaper for the current local hour:
   *   morning 5–10, day 11–15, evening 16–18, night 19–4.
   * Driven by the live clock so the card shifts through the day on its own.
   */
  private get clearScene(): ClearScene {
    const hour = this.now.getHours();
    if (hour < 5) return 'clear-night';
    if (hour < 11) return 'clear-morning';
    if (hour < 16) return 'clear-day';
    if (hour < 19) return 'clear-evening';
    return 'clear-night';
  }

  /** True while the sun is up (morning through evening) for the sun/moon icon. */
  private get isDaytime(): boolean {
    const hour = this.now.getHours();
    return hour >= 5 && hour < 19;
  }

  /**
   * Current-conditions icon, recomputed against the live clock so the sun/moon
   * matches the wallpaper instead of the (cache-stale) fetched snapshot.
   */
  get currentIcon(): string {
    if (!this.weather) return '';
    return describeWeather(this.weather.weatherCode, this.isDaytime).icon;
  }

  /**
   * Practical "before you head out" tip. Prefers the AI-generated text when
   * available; otherwise uses the deterministic rule-based tip. The icon always
   * comes from the rule-based mapping so it's guaranteed to be a valid icon.
   */
  get tip(): { text: string; icon: string } | null {
    if (!this.weather) return null;
    const base = weatherTip(
      this.scene,
      this.weather.temperature,
      this.weather.forecast,
    );
    return this.aiTipText ? { text: this.aiTipText, icon: base.icon } : base;
  }

  /** The next 5 *upcoming* hours, for the forecast strip ([] when unavailable). */
  get forecast(): ForecastHour[] {
    // Drop the in-progress hour and anything past it. The snapshot is cached for
    // up to 15 min, so an hour that was "next" at fetch time can lapse before the
    // next refresh — filtering against now (not fetch time) keeps the strip honest.
    const now = Date.now();
    return (this.weather?.forecast ?? [])
      .filter((h) => h.time > now)
      .slice(0, 5);
  }

  /** The next 7 days, for the second carousel page ([] when unavailable). */
  get daily(): DailyForecast[] {
    return (this.weather?.daily ?? []).slice(0, 7);
  }

  /** Move to the next page (today → 7-day), clamped. */
  nextPage(): void {
    if (this.page < this.LAST_PAGE) this.page++;
  }

  /** Move to the previous page (7-day → today), clamped. */
  prevPage(): void {
    if (this.page > 0) this.page--;
  }

  /** Jump straight to a page — used by the tappable indicator dots. */
  goToPage(i: number): void {
    if (i >= 0 && i <= this.LAST_PAGE) this.page = i;
  }

  onTouchStart(e: TouchEvent): void {
    this.touchStartX = e.changedTouches[0]?.clientX ?? null;
  }

  /** A horizontal swipe past the threshold pages the carousel. */
  onTouchEnd(e: TouchEvent): void {
    if (this.touchStartX == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? this.touchStartX) - this.touchStartX;
    this.touchStartX = null;
    const SWIPE_THRESHOLD = 40; // px — ignore taps and tiny drags
    if (dx <= -SWIPE_THRESHOLD) this.nextPage();
    else if (dx >= SWIPE_THRESHOLD) this.prevPage();
  }
}
