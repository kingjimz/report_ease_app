import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { SettingsService } from '../../_services/settings.service';
import {
  WeatherService,
  WeatherInfo,
  WeatherScene,
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

  /** User-triggered re-analyze when the AI tip failed to load. */
  reanalyzeTip(): void {
    this.refreshAiTip();
  }

  /**
   * Ask the AI service for a tip. On null/error we flag aiTipError so the view
   * can show a small re-analyze button; the rule-based tip stays visible meanwhile.
   */
  private refreshAiTip(): void {
    if (!this.weather || !this.weatherSvc.aiEnabled) {
      this.aiTipLoading = false;
      return;
    }
    this.aiTipLoading = true;
    this.aiTipError = false;
    const hour = this.now.getHours();
    const partOfDay =
      hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    this.weatherSvc
      .getAiTip(this.weather, this.scene, partOfDay)
      .then((text) => {
        if (text) {
          this.aiTipText = text;
          this.aiTipError = false;
        } else {
          this.aiTipError = true;
        }
      })
      .catch(() => (this.aiTipError = true))
      .finally(() => (this.aiTipLoading = false));
  }

  ngOnDestroy(): void {
    if (this.clockId) clearInterval(this.clockId);
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
    const base = weatherTip(this.scene, this.weather.temperature);
    return this.aiTipText ? { text: this.aiTipText, icon: base.icon } : base;
  }
}
