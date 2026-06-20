import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { NetworkService } from './network.service';
import { ApiService } from './api.service';
import { environment } from '../../environments/environment';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const GREETING: ChatMessage = {
  role: 'assistant',
  content:
    "Hi! I'm your in-app helper. Ask me how to use Field Service Tracker — " +
    'logging reports, the calendar, Bible studies, goals, and more.',
};

/** Questions a single user may ask per day; resets at local midnight. */
const DAILY_LIMIT = 20;
const USAGE_KEY = 're_chat_usage';

/** Persisted conversation, so the thread survives reloads and app restarts. */
const MESSAGES_KEY = 're_chat_messages';
/**
 * Hard cap on stored turns. Keeps localStorage small and, just as important,
 * keeps the context we replay to the model bounded so old turns can't drag it
 * into hallucinating about state that no longer exists.
 */
const MAX_STORED_MESSAGES = 50;

/**
 * Talks to the Cloudflare Worker `/chat` route (Workers AI) with a system
 * prompt that scopes answers to this app only. The conversation (including the
 * AI's answers) is persisted to localStorage so it survives reloads, and can be
 * wiped with clearAll(). A per-device daily quota protects the shared AI budget.
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  /** The visible conversation, restored from storage or seeded with a greeting. */
  messages: ChatMessage[] = this.loadMessages();
  /** True while a reply is in flight, so the UI can show a typing indicator. */
  loading = false;

  /** Daily allowance, exposed for the UI. */
  readonly limit = DAILY_LIMIT;

  constructor(
    private http: HttpClient,
    private network: NetworkService,
    private api: ApiService,
  ) {}

  /** Available only when a chat endpoint is configured. */
  get enabled(): boolean {
    return !!environment.chatAiUrl;
  }

  /** Questions already used today. */
  get used(): number {
    return this.readUsage().count;
  }

  /** Questions left today. */
  get remaining(): number {
    return Math.max(0, DAILY_LIMIT - this.used);
  }

  /** True once today's allowance is spent. */
  get limitReached(): boolean {
    return this.remaining <= 0;
  }

  /**
   * Send a user message and append the assistant's reply. Pushes a graceful
   * fallback message on offline/error so the thread never hangs silently.
   */
  async send(text: string): Promise<void> {
    const content = text.trim();
    if (!content || this.loading) return;

    // Daily cap: block before spending the user's turn or any AI budget.
    if (this.limitReached) {
      this.messages.push({
        role: 'assistant',
        content:
          `You've reached today's limit of ${DAILY_LIMIT} questions. ` +
          'It resets tomorrow.',
      });
      this.persist();
      return;
    }

    this.messages.push({ role: 'user', content });
    this.persist();

    if (!this.network.isOnline) {
      this.messages.push({
        role: 'assistant',
        content: "You're offline right now. Reconnect and ask me again.",
      });
      this.persist();
      return;
    }

    this.loading = true;
    try {
      // Compile a fresh snapshot of the user's data so answers reflect reality.
      const context = await this.buildContext().catch(() => '');
      const res: any = await firstValueFrom(
        this.http.post(environment.chatAiUrl, {
          // Send recent turns for context; the worker also caps this.
          messages: this.messages.slice(-10),
          context,
        }),
      );
      const reply = (res?.text || '').trim();
      // Only count questions that actually got an answer.
      this.bumpUsage();
      this.messages.push({
        role: 'assistant',
        content:
          reply ||
          "Sorry, I couldn't come up with an answer. Please try rephrasing.",
      });
    } catch (err: any) {
      const rateLimited = err?.status === 429;
      this.messages.push({
        role: 'assistant',
        content: rateLimited
          ? "I'm getting a lot of questions right now. Please wait about a minute and try again."
          : "Sorry, I couldn't reach the assistant just now. Please try again.",
      });
    } finally {
      this.loading = false;
      this.persist();
    }
  }

  /**
   * Compile a compact, plain-text snapshot of the signed-in user's data for the
   * model to answer from: monthly report totals, active studies/return visits,
   * and goals, plus today's date. Home addresses are deliberately omitted.
   */
  private async buildContext(): Promise<string> {
    const [reports, studies, goals] = await Promise.all([
      this.api.getAllReports().catch(() => []),
      this.api.getBibleStudies().catch(() => []),
      this.api.getGoals().catch(() => []),
    ]);

    // Roll reports up by month so "last month"/"two months ago" are answerable.
    const byMonth = new Map<string, { hours: number; reports: number; studies: number }>();
    for (const r of reports as any[]) {
      const d = this.toDate(r?.report_date);
      if (!d) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const m = byMonth.get(key) || { hours: 0, reports: 0, studies: 0 };
      m.hours += Number(r?.hours) || 0;
      m.reports += 1;
      m.studies += Number(r?.bible_studies ?? r?.bibleStudiesCount) || 0;
      byMonth.set(key, m);
    }
    // Label each month relative to now so the model can answer "last month" /
    // "two months ago" by matching a phrase instead of doing date math.
    const nowIdx = new Date().getFullYear() * 12 + new Date().getMonth();
    const relLabel = (key: string): string => {
      const [y, mo] = key.split('-').map(Number);
      const diff = nowIdx - (y * 12 + (mo - 1));
      if (diff <= 0) return 'this month';
      if (diff === 1) return 'last month';
      return `${diff} months ago`;
    };
    const monthLines = [...byMonth.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 12)
      .map(
        ([k, v]) =>
          `${k} (${relLabel(k)}): ${v.hours} hour(s), ${v.reports} report(s), ${v.studies} bible study count`,
      );

    const activeStudies = (studies as any[])
      .filter((s) => !s?.completed)
      .map((s) => {
        const when = this.toDate(s?.schedule);
        const whenStr = when
          ? when.toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })
          : 'no schedule set';
        const kind = s?.type === 'rv' ? 'return visit' : 'Bible study';
        const lesson = s?.lesson ? `, next lesson: ${s.lesson}` : '';
        return `${s?.bible_study || 'Unnamed'} (${kind}) — scheduled ${whenStr}${lesson}`;
      });

    const goalLines = (goals as any[]).map(
      (g) => `${g?.title || 'Goal'}${g?.description ? `: ${g.description}` : ''}`,
    );

    const now = new Date();
    return [
      `Today is ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`,
      '',
      'MONTHLY REPORT TOTALS (most recent first):',
      monthLines.length ? monthLines.join('\n') : 'No reports recorded.',
      '',
      'ACTIVE BIBLE STUDIES & RETURN VISITS:',
      activeStudies.length ? activeStudies.join('\n') : 'None.',
      '',
      'GOALS:',
      goalLines.length ? goalLines.join('\n') : 'None.',
    ].join('\n');
  }

  /** Normalize Firestore Timestamp | Date | string | epoch into a Date. */
  private toDate(value: any): Date | null {
    if (!value) return null;
    try {
      if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
      if (typeof value.toDate === 'function') return value.toDate();
      if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }

  /**
   * Clear every stored chat back to the opening greeting and wipe the persisted
   * thread. Starting from a clean slate keeps the model from being fed stale
   * turns it could hallucinate around. Does not refund today's usage.
   */
  clearAll(): void {
    this.messages = [{ ...GREETING }];
    this.loading = false;
    this.persist();
  }

  /** Back-compat alias for the "Start over" control. */
  reset(): void {
    this.clearAll();
  }

  /** Restore the saved thread, or seed a fresh greeting when none/invalid. */
  private loadMessages(): ChatMessage[] {
    try {
      const raw = localStorage.getItem(MESSAGES_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.length) {
        const valid = parsed.filter(
          (m: any) =>
            (m?.role === 'user' || m?.role === 'assistant') &&
            typeof m?.content === 'string',
        );
        if (valid.length) return valid.slice(-MAX_STORED_MESSAGES);
      }
    } catch {
      /* corrupt/unavailable storage — fall back to a fresh greeting */
    }
    return [{ ...GREETING }];
  }

  /** Persist the (capped) thread so it survives reloads. */
  private persist(): void {
    try {
      const trimmed = this.messages.slice(-MAX_STORED_MESSAGES);
      localStorage.setItem(MESSAGES_KEY, JSON.stringify(trimmed));
    } catch {
      /* storage unavailable — thread just won't persist this session */
    }
  }

  /** Local YYYY-MM-DD, so the cap resets at the user's own midnight. */
  private todayKey(): string {
    return new Date().toLocaleDateString('en-CA');
  }

  /** Today's usage record, or a fresh zero count when the day has rolled over. */
  private readUsage(): { date: string; count: number } {
    try {
      const parsed = JSON.parse(localStorage.getItem(USAGE_KEY) || 'null');
      if (parsed && parsed.date === this.todayKey()) return parsed;
    } catch {
      /* fall through to a fresh count */
    }
    return { date: this.todayKey(), count: 0 };
  }

  private bumpUsage(): void {
    const next = { date: this.todayKey(), count: this.readUsage().count + 1 };
    try {
      localStorage.setItem(USAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — limit just won't persist */
    }
  }
}
