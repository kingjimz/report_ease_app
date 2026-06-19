import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { SettingsService } from '../../_services/settings.service';
import {
  WeatherService,
  WeatherInfo,
  WeatherScene,
  ForecastHour,
  weatherScene,
  weatherTip,
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
  aiTipText: string | null = null;
  aiTipLoading = false;
  aiTipError = false;
  locationEnabled = true;

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
    this.weatherSvc.getLocationAndWeather().then((info) => {
      if (info) {
        this.weather = info;
        this.refreshAiTip(true);
      }
    });
  }

  /** Turn location on from the widget prompt; the subscription triggers the load. */
  enableLocation(): void {
    this.settings.setLocationEnabled(true);
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
      hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
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
   * Animated background scene. Uses the live weather when available; otherwise
   * falls back to a time-of-day clear scene so the card is never blank.
   */
  get scene(): WeatherScene {
    if (this.weather) {
      return weatherScene(this.weather.weatherCode, this.weather.isDay);
    }
    const hour = this.now.getHours();
    return hour >= 6 && hour < 19 ? 'clear-day' : 'clear-night';
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

  /** The next 5 hours, for the forecast strip ([] when unavailable). */
  get forecast(): ForecastHour[] {
    // Cap at 5 even if a stale cache holds more, so the strip stays consistent.
    return (this.weather?.forecast ?? []).slice(0, 5);
  }
}
