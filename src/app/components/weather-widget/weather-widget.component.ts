import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { AuthService } from '../../_services/auth.service';
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
  userName = '';
  weather: WeatherInfo | null = null;
  weatherLoading = true;
  aiTipText: string | null = null;
  aiTipLoading = false;

  private clockId: any = null;
  private userSub?: Subscription;

  constructor(
    private auth: AuthService,
    private weatherSvc: WeatherService,
  ) {}

  ngOnInit(): void {
    // Live clock, ticking each second.
    this.clockId = setInterval(() => (this.now = new Date()), 1000);

    // Resolve a friendly name: displayName, else the local part of the email.
    this.userSub = this.auth.user$.subscribe((user) => {
      if (user?.displayName) {
        this.userName = user.displayName.split(' ')[0];
      } else if (user?.email) {
        const local = user.email.split('@')[0];
        this.userName = local.charAt(0).toUpperCase() + local.slice(1);
      } else {
        this.userName = '';
      }
    });

    // Show cached weather instantly, then refresh in the background.
    this.weather = this.weatherSvc.getCached();
    this.weatherLoading = !this.weather;
    // If AI tips are enabled, show the loading state up front so the rule-based
    // tip doesn't flash before the AI response arrives.
    this.aiTipLoading = this.weatherSvc.aiEnabled && !!this.weather;
    console.log('[WeatherTip] aiEnabled =', this.weatherSvc.aiEnabled);
    this.weatherSvc
      .getLocationAndWeather()
      .then((info) => {
        console.log('[WeatherTip] weather resolved:', info);
        if (info) {
          this.weather = info;
          this.refreshAiTip();
        } else {
          console.warn('[WeatherTip] No weather (geolocation/offline?) — AI tip skipped.');
          this.aiTipLoading = false;
        }
      })
      .finally(() => (this.weatherLoading = false));
  }

  /** Ask the AI service for a tip; falls back to the rule-based tip on null. */
  private refreshAiTip(): void {
    if (!this.weather || !this.weatherSvc.aiEnabled) {
      console.warn('[WeatherTip] refreshAiTip skipped', {
        hasWeather: !!this.weather,
        aiEnabled: this.weatherSvc.aiEnabled,
      });
      this.aiTipLoading = false;
      return;
    }
    this.aiTipLoading = true;
    const hour = this.now.getHours();
    const partOfDay =
      hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    this.weatherSvc
      .getAiTip(this.weather, this.scene, partOfDay)
      .then((text) => {
        if (text) this.aiTipText = text;
      })
      .finally(() => (this.aiTipLoading = false));
  }

  ngOnDestroy(): void {
    if (this.clockId) clearInterval(this.clockId);
    this.userSub?.unsubscribe();
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
