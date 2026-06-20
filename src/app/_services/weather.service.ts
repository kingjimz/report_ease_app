import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { NetworkService } from './network.service';
import { SettingsService } from './settings.service';
import { environment } from '../../environments/environment';

export interface WeatherInfo {
  city: string;
  temperature: number;
  weatherCode: number;
  description: string;
  icon: string;
  isDay: boolean;
  /** epoch ms of when this snapshot was fetched */
  fetchedAt: number;
  /** Up to the next 5 hours of forecast (empty if unavailable). */
  forecast?: ForecastHour[];
  /** Up to the next 7 daily forecasts (empty if unavailable). */
  daily?: DailyForecast[];
}

/** A single hour in the short-term forecast. */
export interface ForecastHour {
  /** epoch ms for this hour (for `| date:'ha'` labels) */
  time: number;
  /** °C, rounded */
  temperature: number;
  weatherCode: number;
  /** Bootstrap Icon class, from describeWeather() */
  icon: string;
  /** chance of precipitation, 0–100 */
  precipProbability: number;
}

/** A single day in the 7-day forecast. */
export interface DailyForecast {
  /** epoch ms for this day (for `| date:'EEE'` labels) */
  time: number;
  /** °C, rounded — daytime high */
  tempMax: number;
  /** °C, rounded — overnight low */
  tempMin: number;
  weatherCode: number;
  /** Bootstrap Icon class, from describeWeather() */
  icon: string;
  /** max chance of precipitation that day, 0–100 */
  precipProbability: number;
}

interface Coords {
  lat: number;
  lon: number;
  city?: string;
}

// Bump the suffix when the cached shape changes (e.g. added daily forecast) so
// older snapshots are discarded and a fresh, complete pull replaces them.
const CACHE_KEY = 're_weather_cache_v2';
const AI_TIP_CACHE_KEY = 're_weather_ai_tip';
// Don't hit the network more than once every 15 minutes; the cache covers the rest.
const REFRESH_MS = 15 * 60 * 1000;
// Keep AI tips glanceable — a hint to the Worker and a hard cap on our side.
const TIP_MAX_WORDS = 30;

/**
 * Trim text to at most `max` words. Drops a trailing comma/semicolon left by the
 * cut and appends an ellipsis so a clipped tip still reads as a complete thought.
 */
function capWords(text: string, max: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= max) return text;
  return words.slice(0, max).join(' ').replace(/[,;:]$/, '') + '…';
}

interface AiTipCache {
  /** YYYY-MM-DD + scene + temperature bucket — the conditions this tip was for. */
  signature: string;
  text: string;
}

@Injectable({
  providedIn: 'root',
})
export class WeatherService {
  /** True when the AI tip proxy is configured (Worker URL set). */
  readonly aiEnabled = !!environment.weatherAiUrl;

  constructor(
    private http: HttpClient,
    private network: NetworkService,
    private settings: SettingsService,
  ) {}

  /**
   * True when a background poll would actually hit the network: we're online and
   * the cache is missing or older than the 15-minute window. Lets the UI show a
   * "refreshing" indicator only when fresh data is genuinely being fetched, not
   * on instant cache hits.
   */
  isRefreshDue(): boolean {
    if (!this.network.isOnline) return false;
    const cached = this.getCached();
    return !cached || Date.now() - cached.fetchedAt >= REFRESH_MS;
  }

  /** Last successfully cached snapshot, or null if none stored. */
  getCached(): WeatherInfo | null {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? (JSON.parse(raw) as WeatherInfo) : null;
    } catch {
      return null;
    }
  }

  /**
   * Returns an AI-generated preparation tip via the Worker proxy, or null when
   * the feature is off / offline / errors (caller falls back to the rule-based tip).
   *
   * Cached against the EXACT inputs sent to the AI (scene, time of day,
   * temperature, condition, city). The cached tip is reused only while those
   * inputs are identical; the moment any of them changes, the cache misses and
   * a fresh tip is fetched and re-cached, keeping the advice accurate. The
   * 15-minute weather cache upstream throttles how often this can happen.
   */
  async getAiTip(
    weather: WeatherInfo,
    scene: WeatherScene,
    partOfDay: string,
    force = false,
  ): Promise<string | null> {
    if (!environment.weatherAiUrl) {
      console.warn('[WeatherTip] No weatherAiUrl set in environment — AI off.');
      return null;
    }

    const forecast = weather.forecast ?? [];
    // Only feed the AI hours still ahead of now. The forecast's first entry is the
    // current hour (e.g. 4 PM at 4:22), so without this the tip can quote a time
    // that has already passed. This keeps the lookahead pointed at what's coming.
    const upcoming = forecast.filter((h) => h.time > Date.now());
    const payload = {
      scene,
      partOfDay,
      temperature: weather.temperature,
      description: weather.description,
      city: weather.city,
      // Ask the Worker to keep tips terse; we also hard-cap on our side below.
      maxWords: TIP_MAX_WORDS,
      // Only send a forecast line when we actually have upcoming hours.
      ...(upcoming.length ? { forecastText: forecastText(upcoming) } : {}),
    };
    const signature = this.aiSignature({ ...payload, forecast: upcoming });

    console.log('[WeatherTip] getAiTip called', {
      online: this.network.isOnline,
      signature,
      payload,
    });

    const cached = this.readAiCache();
    if (!force && cached && cached.signature === signature) {
      console.log('[WeatherTip] Inputs unchanged — reusing cached tip:', cached.text);
      return cached.text;
    }
    if (force) {
      console.log('[WeatherTip] Forced re-analyze — bypassing cache.');
    }

    if (cached) {
      console.log('[WeatherTip] Inputs changed — fetching fresh tip.', {
        was: cached.signature,
        now: signature,
      });
    }

    if (!this.network.isOnline) {
      console.warn('[WeatherTip] Offline — cannot refresh tip.');
      return null;
    }

    try {
      console.log('[WeatherTip] POST →', environment.weatherAiUrl, payload);
      const res: any = await firstValueFrom(
        this.http.post(environment.weatherAiUrl, payload),
      );
      console.log('[WeatherTip] Response:', res);
      const raw = typeof res?.text === 'string' ? res.text.trim() : '';
      if (!raw) {
        console.warn('[WeatherTip] Empty/invalid text in response.');
        return null;
      }
      // Enforce the 20-word cap regardless of what the Worker returns.
      const text = capWords(raw, TIP_MAX_WORDS);
      localStorage.setItem(
        AI_TIP_CACHE_KEY,
        JSON.stringify({ signature, text } as AiTipCache),
      );
      console.log('[WeatherTip] Fresh AI tip cached:', text);
      return text;
    } catch (err) {
      console.error('[WeatherTip] API call failed:', err);
      return null;
    }
  }

  /**
   * Signature = every input the AI sees, so any change invalidates the cache.
   * Temperature is bucketed into 2°C bands so small fluctuations don't trigger
   * needless refreshes (and AI calls) while still tracking real changes.
   */
  private aiSignature(payload: {
    scene: WeatherScene;
    partOfDay: string;
    temperature: number;
    description: string;
    city: string;
    forecast: ForecastHour[];
  }): string {
    const tempBand = Math.round(payload.temperature / 2) * 2; // 2°C bands
    return [
      // Local date so the tip refreshes once a day even when conditions repeat,
      // while still caching within the day (no extra quota churn).
      this.localDate(),
      payload.scene,
      payload.partOfDay,
      tempBand,
      payload.description,
      payload.city,
      // Coarse forecast digest so the tip only refreshes on meaningful change.
      forecastDigest(payload.forecast),
    ].join('|');
  }

  /** Today's local date as YYYY-MM-DD (timezone-safe, no UTC drift). */
  private localDate(): string {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  private readAiCache(): AiTipCache | null {
    try {
      const raw = localStorage.getItem(AI_TIP_CACHE_KEY);
      return raw ? (JSON.parse(raw) as AiTipCache) : null;
    } catch {
      return null;
    }
  }

  /**
   * Returns current location + weather. Hydrates from cache first; only hits the
   * network when online and the cache is stale, so it stays cheap and offline-safe.
   *
   * Pass `force = true` to bypass the 15-minute freshness window and pull fresh
   * data now (manual refresh). Offline still falls back to cache regardless.
   */
  async getLocationAndWeather(force = false): Promise<WeatherInfo | null> {
    // Respect the user's location preference — no geolocation prompt when off.
    if (!this.settings.isLocationEnabled()) {
      return null;
    }

    const cached = this.getCached();

    const fresh =
      cached && Date.now() - cached.fetchedAt < REFRESH_MS;
    if ((fresh && !force) || !this.network.isOnline) {
      return cached;
    }

    try {
      const coords = await this.resolveCoords();
      const weather = await this.fetchWeather(coords);
      const city = coords.city || (await this.fetchCity(coords)) || 'Your area';

      const info: WeatherInfo = { ...weather, city, fetchedAt: Date.now() };
      localStorage.setItem(CACHE_KEY, JSON.stringify(info));
      return info;
    } catch (err) {
      console.warn('Weather lookup failed, using cache if available:', err);
      return cached;
    }
  }

  /** Browser geolocation first; fall back to a free no-key IP lookup. */
  private async resolveCoords(): Promise<Coords> {
    try {
      return await this.getBrowserCoords();
    } catch {
      return await this.getIpCoords();
    }
  }

  private getBrowserCoords(): Promise<Coords> {
    return new Promise<Coords>((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        reject(new Error('Geolocation unsupported'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 10 * 60 * 1000 },
      );
    });
  }

  private async getIpCoords(): Promise<Coords> {
    const res: any = await firstValueFrom(
      this.http.get('https://ipapi.co/json/'),
    );
    if (res?.latitude == null || res?.longitude == null) {
      throw new Error('IP location unavailable');
    }
    const city = [res.city, res.region].filter(Boolean).join(', ') || undefined;
    return { lat: res.latitude, lon: res.longitude, city };
  }

  private async fetchWeather(
    coords: Coords,
  ): Promise<Omit<WeatherInfo, 'city' | 'fetchedAt'>> {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}` +
      `&longitude=${coords.lon}` +
      `&current=temperature_2m,weather_code,is_day,precipitation,cloud_cover` +
      `&hourly=temperature_2m,weather_code,precipitation_probability,precipitation,cloud_cover` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&forecast_hours=7&forecast_days=7&timezone=auto`;
    const res: any = await firstValueFrom(this.http.get(url));
    const current = res?.current;
    if (!current) throw new Error('No weather data');

    const isDay = current.is_day === 1;
    const code = reconcileCode(
      current.weather_code as number,
      Number(current.precipitation) || 0,
      Number(current.cloud_cover) || 0,
    );
    const map = describeWeather(code, isDay);
    return {
      temperature: Math.round(current.temperature_2m),
      weatherCode: code,
      description: map.description,
      icon: map.icon,
      isDay,
      forecast: this.parseForecast(res?.hourly, isDay),
      daily: this.parseDaily(res?.daily),
    };
  }

  /**
   * Turn Open-Meteo's parallel daily arrays into up to 7 DailyForecast entries.
   * Daily icons use the daytime variant (these rows represent whole days).
   * Returns [] when the payload is missing so callers degrade gracefully.
   */
  private parseDaily(daily: any): DailyForecast[] {
    const times: any[] = daily?.time ?? [];
    const maxs: any[] = daily?.temperature_2m_max ?? [];
    const mins: any[] = daily?.temperature_2m_min ?? [];
    const codes: any[] = daily?.weather_code ?? [];
    const precips: any[] = daily?.precipitation_probability_max ?? [];
    if (!times.length) return [];

    const out: DailyForecast[] = [];
    for (let i = 0; i < Math.min(7, times.length); i++) {
      const code = Number(codes[i]);
      out.push({
        time: new Date(times[i]).getTime(),
        tempMax: Math.round(Number(maxs[i])),
        tempMin: Math.round(Number(mins[i])),
        weatherCode: code,
        icon: describeWeather(code, true).icon,
        precipProbability: Math.round(Number(precips[i]) || 0),
      });
    }
    return out;
  }

  /**
   * Turn Open-Meteo's parallel hourly arrays into ForecastHour entries. The
   * first entry is the *current* hour (e.g. 10:00 at 10:39), and the snapshot is
   * cached for up to 15 min — so we keep the whole window here and let callers
   * drop already-passed hours relative to render time (the widget's `forecast`
   * getter, the AI tip's own filter). Fetching 7 hours leaves a buffer so 5
   * future cards remain even at the tail of the cache window. Icons reuse the
   * current day/night flag (close enough over the window). Returns [] when the
   * payload is missing or malformed so callers degrade to current-only.
   */
  private parseForecast(hourly: any, isDay: boolean): ForecastHour[] {
    const times: any[] = hourly?.time ?? [];
    const temps: any[] = hourly?.temperature_2m ?? [];
    const codes: any[] = hourly?.weather_code ?? [];
    const precips: any[] = hourly?.precipitation_probability ?? [];
    const precipMm: any[] = hourly?.precipitation ?? [];
    const clouds: any[] = hourly?.cloud_cover ?? [];
    if (!times.length) return [];

    const out: ForecastHour[] = [];
    for (let i = 0; i < Math.min(7, times.length); i++) {
      const code = reconcileCode(
        Number(codes[i]),
        Number(precipMm[i]) || 0,
        Number(clouds[i]) || 0,
      );
      out.push({
        time: new Date(times[i]).getTime(),
        temperature: Math.round(Number(temps[i])),
        weatherCode: code,
        icon: describeWeather(code, isDay).icon,
        precipProbability: Math.round(Number(precips[i]) || 0),
      });
    }
    return out;
  }

  private async fetchCity(coords: Coords): Promise<string | null> {
    try {
      const url =
        `https://api.bigdatacloud.net/data/reverse-geocode-client` +
        `?latitude=${coords.lat}&longitude=${coords.lon}&localityLanguage=en`;
      const res: any = await firstValueFrom(this.http.get(url));
      // Municipality/city, then province — e.g. "Tanza, Cavite".
      const locality = res?.city || res?.locality || null;
      const province = this.extractProvince(res, locality);
      if (locality && province && locality !== province) {
        return `${locality}, ${province}`;
      }
      return locality || province || null;
    } catch {
      return null;
    }
  }

  /**
   * The province (e.g. "Cavite"), not the region. bigdatacloud's
   * `principalSubdivision` returns the region in some countries (the Philippines
   * gives "Calabarzon"), so we instead take the administrative entry sitting one
   * level above the city in `localityInfo.administrative` (sorted by adminLevel).
   */
  private extractProvince(res: any, locality: string | null): string | null {
    const admins: any[] = res?.localityInfo?.administrative ?? [];
    const cityLevel = admins.find((a) => a?.name === locality)?.adminLevel;
    const parents = admins.filter(
      (a) =>
        typeof a?.adminLevel === 'number' &&
        (cityLevel == null || a.adminLevel < cityLevel),
    );
    if (!parents.length) return res?.principalSubdivision || null;
    // The city's immediate parent = the largest adminLevel still below the city.
    const parent = parents.reduce((best, a) =>
      a.adminLevel > best.adminLevel ? a : best,
    );
    // Strip any "(Region ...)" style suffix.
    return parent?.name ? String(parent.name).replace(/\s*\(.*\)\s*$/, '').trim() : null;
  }
}

/** A coarse visual category used to pick the animated card background. */
export type WeatherScene =
  | 'clear-morning'
  | 'clear-day'
  | 'clear-evening'
  | 'clear-night'
  | 'clouds'
  | 'rain'
  | 'snow'
  | 'fog'
  | 'storm';

/** The four clear-sky variants, in case the caller needs the time-of-day set. */
export type ClearScene =
  | 'clear-morning'
  | 'clear-day'
  | 'clear-evening'
  | 'clear-night';

/**
 * Map a WMO weather code to a background scene. Active weather (rain, storm,
 * etc.) wins; for a clear or mostly-clear sky the caller supplies the
 * time-of-day variant via `clearScene` so the wallpaper can read as morning,
 * day, evening, or night.
 */
export function weatherScene(code: number, clearScene: ClearScene): WeatherScene {
  if (code >= 95) return 'storm';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code === 45 || code === 48) return 'fog';
  if (code === 2 || code === 3) return 'clouds';
  // 0 (clear) and 1 (mostly clear) → the supplied time-of-day clear scene.
  return clearScene;
}

/** A compact one-line forecast the AI can read, e.g. "Next 5h: 2PM 31° Rain 60%, ...". */
export function forecastText(forecast: ForecastHour[]): string {
  const parts = forecast.map((h) => {
    const label = new Date(h.time)
      .toLocaleTimeString('en-US', { hour: 'numeric' })
      .replace(/\s/g, '');
    const map = describeWeather(h.weatherCode, true);
    return `${label} ${h.temperature}° ${map.description} ${h.precipProbability}%`;
  });
  return parts.length ? `Next 5h: ${parts.join(', ')}.` : '';
}

/**
 * Coarse, cache-stable summary of the forecast: max precip in 20% bands, whether
 * rain is imminent (≥50% within 3h), and the warmest hour in 2°C bands. The tip
 * only re-fetches when one of these shifts, not every hour.
 */
export function forecastDigest(forecast: ForecastHour[]): string {
  if (!forecast.length) return 'none';
  const precips = forecast.map((h) => h.precipProbability);
  const maxPrecipBand = Math.round(Math.max(...precips) / 20) * 20;
  const rainSoon = forecast
    .slice(0, 3)
    .some((h) => h.precipProbability >= 50);
  const maxTempBand =
    Math.round(Math.max(...forecast.map((h) => h.temperature)) / 2) * 2;
  return `p${maxPrecipBand}|r${rainSoon ? 1 : 0}|t${maxTempBand}`;
}

/**
 * A short, practical "before you head out" tip. Severe conditions take priority,
 * then an incoming-rain lookahead, then temperature extremes, then a pleasant
 * default. Temperature is in °C; `forecast` is the next few hours (optional).
 */
export function weatherTip(
  scene: WeatherScene,
  temperature: number,
  forecast: ForecastHour[] = [],
): { text: string; icon: string } {
  // Weather hazards first.
  if (scene === 'storm')
    return {
      text: 'Thunderstorms about. Best to wait it out before heading to the ministry.',
      icon: 'bi-cloud-lightning-rain',
    };
  // Rain at/below freezing is really an icing hazard, not an umbrella day.
  if (scene === 'rain' && temperature <= 1)
    return {
      text: 'Freezing rain possible. Surfaces may be icy, so take great care.',
      icon: 'bi-thermometer-snow',
    };
  if (scene === 'rain')
    return {
      text: 'Rain expected. Take an umbrella and keep literature in a waterproof bag.',
      icon: 'bi-umbrella',
    };
  if (scene === 'snow')
    return {
      text: 'Snow out there. Bundle up and wear shoes with good grip.',
      icon: 'bi-snow',
    };
  if (scene === 'fog')
    return {
      text: 'Low visibility. Take extra care if you are driving.',
      icon: 'bi-cloud-haze2',
    };

  // Dry now, but rain on the way in the next few hours? Pack an umbrella.
  const rainAhead = forecast.some(
    (h) => h.precipProbability >= 60 || h.weatherCode >= 51,
  );
  if (rainAhead)
    return {
      text: 'Dry now, but rain is expected later. Take an umbrella to be safe.',
      icon: 'bi-umbrella',
    };

  // Then temperature extremes for otherwise clear/cloudy weather.
  if (temperature >= 32)
    return {
      text: 'Hot today. Carry water, wear a hat, and take shade breaks.',
      icon: 'bi-thermometer-sun',
    };
  if (temperature >= 27)
    return {
      text: 'Warm out. Bring water and dress light.',
      icon: 'bi-sun',
    };
  if (temperature <= 4)
    return {
      text: 'Cold out. Layer up and wear a warm coat.',
      icon: 'bi-thermometer-snow',
    };
  if (temperature <= 12)
    return {
      text: 'A bit chilly. A light jacket would be wise.',
      icon: 'bi-wind',
    };

  // Pleasant default.
  return {
    text: 'Pleasant weather. A great day to be out in the ministry.',
    icon: 'bi-emoji-smile',
  };
}

/** Map a WMO weather code to a label + a Bootstrap Icon already bundled in the app. */
/**
 * Global models overcall rain/thunderstorms over coarse grid cells, so the app
 * can read "Thunderstorm" on a dry, cloudy day. When the model itself reports no
 * precipitation, relabel by cloud cover instead of trusting a "wet" code.
 * Returns a corrected WMO code; correcting once here keeps every downstream
 * consumer (description, scene, icon, forecast, AI tip) honest with no changes.
 */
function reconcileCode(
  code: number,
  precipitationMm: number,
  cloudCover: number,
): number {
  const isWetCode = code >= 51; // drizzle (51) through thunderstorm (99)
  if (!isWetCode) return code; // clear/cloud/fog codes are trustworthy
  if (precipitationMm > 0.1) return code; // genuinely precipitating — keep it
  // Dry despite a wet code → describe the sky.
  if (cloudCover >= 85) return 3; // Overcast
  if (cloudCover >= 40) return 2; // Partly cloudy
  if (cloudCover >= 15) return 1; // Mostly clear
  return 0; // Clear sky
}

export function describeWeather(
  code: number,
  isDay: boolean,
): { description: string; icon: string } {
  const sun = isDay ? 'bi-sun' : 'bi-moon-stars';
  const partly = isDay ? 'bi-cloud-sun' : 'bi-cloud-moon';

  if (code === 0) return { description: 'Clear sky', icon: sun };
  if (code === 1) return { description: 'Mostly clear', icon: partly };
  if (code === 2) return { description: 'Partly cloudy', icon: partly };
  if (code === 3) return { description: 'Cloudy', icon: 'bi-clouds' };
  if (code === 45 || code === 48)
    return { description: 'Foggy', icon: 'bi-cloud-fog' };
  if (code >= 51 && code <= 57)
    return { description: 'Drizzle', icon: 'bi-cloud-drizzle' };
  if (code >= 61 && code <= 67)
    return { description: 'Rain', icon: 'bi-cloud-rain' };
  if (code >= 71 && code <= 77)
    return { description: 'Snow', icon: 'bi-cloud-snow' };
  if (code >= 80 && code <= 82)
    return { description: 'Rain showers', icon: 'bi-cloud-rain-heavy' };
  if (code === 85 || code === 86)
    return { description: 'Snow showers', icon: 'bi-cloud-snow' };
  if (code >= 95)
    return { description: 'Thunderstorm', icon: 'bi-cloud-lightning-rain' };
  return { description: 'Weather', icon: 'bi-cloud' };
}
