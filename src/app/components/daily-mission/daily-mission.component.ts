import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { Subscription } from 'rxjs';
import { ApiService } from '../../_services/api.service';
import { UtilService } from '../../_services/util.service';
import { ModalService } from '../../_services/modal.service';
import {
  ChecklistItem,
  Verse,
  MISSION_VERSES,
  KEY_SEPARATOR,
  ROTATION_EPOCH,
} from '../../_services/mission.service';

interface CalendarCell {
  day: number;
  key: string; // YYYY-MM-DD
  passed: boolean;
  isToday: boolean;
  isFuture: boolean;
}

@Component({
  selector: 'app-daily-mission',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatCheckboxModule,
    MatProgressBarModule,
    MatTooltipModule,
    MatChipsModule,
  ],
  templateUrl: './daily-mission.component.html',
  styleUrl: './daily-mission.component.css',
  styles: [
    `
      @keyframes mission-sheet-up {
        from {
          transform: translateY(100%);
        }
        to {
          transform: translateY(0);
        }
      }
      .mission-sheet {
        animation: mission-sheet-up 0.28s cubic-bezier(0.32, 0.72, 0, 1);
      }
      @keyframes mission-fade-in {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      .mission-fade {
        animation: mission-fade-in 0.2s ease-out;
      }
      /* Celebration overlay: pop in, hold, fade out over ~3s */
      @keyframes celebrate-pop {
        0% {
          transform: scale(0.3);
          opacity: 0;
        }
        12% {
          transform: scale(1.15);
          opacity: 1;
        }
        24% {
          transform: scale(1);
        }
        80% {
          transform: scale(1);
          opacity: 1;
        }
        100% {
          transform: scale(0.85);
          opacity: 0;
        }
      }
      .celebrate-pop {
        animation: celebrate-pop 3s ease-in-out forwards;
      }
      @keyframes celebrate-emoji {
        0% {
          transform: translateY(10px) scale(0.5);
          opacity: 0;
        }
        20% {
          transform: translateY(0) scale(1);
          opacity: 1;
        }
        70% {
          transform: translateY(-6px) scale(1);
          opacity: 1;
        }
        100% {
          transform: translateY(-20px) scale(0.9);
          opacity: 0;
        }
      }
      .celebrate-emoji {
        display: inline-block;
        animation: celebrate-emoji 3s ease-in-out forwards;
      }
    `,
  ],
})
export class DailyMissionComponent implements OnInit, OnDestroy {
  // Fixed mission definition. Each day surfaces one command of the Sermon on the Mount.
  readonly mission = {
    id: 'sermon-on-the-mount',
    title: 'Sermon on the Mount',
    reference: 'Matthew 5-7',
    description:
      "Each day brings one command of Jesus' Sermon on the Mount. Work through the steps to live it out; finish them all to pass the day.",
  };

  readonly weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  private verses: Verse[] = [];
  todayKey = '';
  todayVerse?: Verse;

  // Rotation position, surfaced so users see the plan is an ongoing loop that
  // never runs out: after the last verse it cycles back to the first, forever.
  readonly missionCount = MISSION_VERSES.length;
  todayPosition = 0; // 1-based position within the current cycle
  todayCycle = 0; // which pass through the full set (1, 2, 3, ...)

  // Checklist item ids completed for today.
  todayChecked = new Set<string>();
  // Count of in-flight writes; while > 0 we don't overwrite local state from the listener.
  private writesInFlight = 0;

  passedToday = false;
  todayProgressPercent = 0;

  // Dates (YYYY-MM-DD) whose mission was fully passed.
  private passedDates = new Set<string>();
  // All completion records keyed by date, for inspecting any past day.
  private completionsByDate = new Map<string, any>();

  // Habit stats (gamification: streaks + milestones, no per-check points).
  currentStreak = 0;
  longestStreak = 0;
  totalPassed = 0;
  currentMilestone: number | null = null;
  private readonly milestones = [100, 30, 7];

  // Calendar day detail view.
  selectedDate: string | null = null;
  selectedVerse: Verse | null = null;
  selectedChecked = new Set<string>();
  selectedPassed = false;
  selectedDateLabel = '';

  // Calendar history
  viewMonth!: Date; // first day of the month being viewed
  monthLabel = '';
  calendarCells: (CalendarCell | null)[] = [];
  passedCount = 0;

  // Whether the bottom-sheet day detail is currently open (for scroll-lock).
  private detailOpen = false;

  // Celebration overlay shown for a few seconds when a practice is passed.
  showCelebration = false;
  celebrationMessage = '';
  private celebrationTimeout?: ReturnType<typeof setTimeout>;
  private readonly encouragements = [
    "Keep going, you're building a great habit!",
    'One day at a time. Well done!',
    'Stay the course, keep applying it!',
    'You are growing in faith every day. Keep it up!',
    'Wonderful, see you for tomorrow’s practice!',
  ];

  private sub?: Subscription;

  constructor(
    public api: ApiService,
    private util: UtilService,
    private modal: ModalService,
  ) {}

  ngOnInit() {
    this.todayKey = this.util.getLocalDateKey();
    this.viewMonth = this.firstOfMonth(new Date());
    this.buildVerses();
    this.todayVerse = this.getVerseForDate(this.todayKey);
    this.computeRotationPosition();
    this.sub = this.api.missionCompletions$.subscribe((completions) => {
      this.ingestCompletions(completions || []);
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    if (this.celebrationTimeout) clearTimeout(this.celebrationTimeout);
    // Release the body scroll-lock if the sheet was left open.
    if (this.detailOpen) {
      this.modal.closeModal();
      this.detailOpen = false;
    }
  }

  // Show the celebration overlay for a few seconds, then auto-hide. When a
  // streak is known, encourage them to keep it going; otherwise rotate a message.
  private celebrate(streak = 0) {
    if (this.celebrationTimeout) clearTimeout(this.celebrationTimeout);
    this.celebrationMessage =
      streak >= 2
        ? `${streak} days in a row — keep it going!`
        : this.encouragements[
            Math.floor(Math.random() * this.encouragements.length)
          ];
    this.showCelebration = true;
    this.celebrationTimeout = setTimeout(() => {
      this.showCelebration = false;
    }, 3000);
  }

  // Current streak counting today as passed (passedDates may not reflect the
  // just-saved completion yet, so compute it locally for the message).
  private streakIncludingToday(): number {
    const set = new Set(this.passedDates);
    set.add(this.todayKey);
    let cursor = this.todayKey;
    let streak = 0;
    while (set.has(cursor)) {
      streak++;
      cursor = this.dayKeyOffset(cursor, -1);
    }
    return streak;
  }

  private buildVerses() {
    this.verses = MISSION_VERSES.map((m) => {
      const key = `mt-${m.chapter}-${m.verseNum}`;
      return {
        key,
        chapter: m.chapter,
        verseNum: m.verseNum,
        reference: `Matthew ${m.chapter}:${m.verseNum}`,
        label: m.label,
        step: m.step,
        checklist: m.checklist.map((text, i) => ({ id: `${key}-s${i}`, text })),
        link: this.buildLink(m.chapter, m.verseNum),
        appLink: this.buildAppLink(m.chapter, m.verseNum),
      };
    });
  }

  // JW Library deep link. `bible` code is book(2) + chapter(3) + verse(3); Matthew = 40.
  private buildAppLink(chapter: number, verse: number): string {
    const pad = (n: number) => String(n).padStart(3, '0');
    const code = `40${pad(chapter)}${pad(verse)}`;
    return `jwlibrary:///finder?srcid=jwlshare&wtlocale=E&prefer=lang&pub=nwtsty&bible=${code}`;
  }

  // Open the verse in the JW Library app if installed; otherwise fall back to
  // the jw.org website. We try the app deep link and, if the page is still
  // visible shortly after (app didn't take over), open the website.
  openVerse(verse?: Verse | null) {
    if (!verse) return;
    let switchedToApp = false;
    const onHide = () => {
      if (document.hidden) switchedToApp = true;
    };
    document.addEventListener('visibilitychange', onHide);

    const start = Date.now();
    try {
      window.location.href = verse.appLink;
    } catch {
      // Scheme not supported; fall through to the website below.
    }

    setTimeout(() => {
      document.removeEventListener('visibilitychange', onHide);
      // If the app opened, the tab was hidden; otherwise open the website.
      if (!switchedToApp && !document.hidden && Date.now() - start < 2500) {
        window.open(verse.link, '_blank', 'noopener');
      }
    }, 1200);
  }

  // Deterministically rotate through the verses, one per calendar day.
  private getVerseForDate(dateKey: string): Verse {
    return this.verses[this.rotationIndex(dateKey)];
  }

  // Zero-based index into the verse list for a date. Modulo wraps endlessly:
  // the day after the final verse returns the first one again, so the daily
  // mission continues indefinitely.
  private rotationIndex(dateKey: string): number {
    const [y, m, d] = dateKey.split('-').map(Number);
    const today = new Date(y, m - 1, d).getTime();
    const dayIndex = Math.floor((today - ROTATION_EPOCH.getTime()) / 86400000);
    const len = this.verses.length;
    return ((dayIndex % len) + len) % len;
  }

  // How many full passes through the set have elapsed by this date (1-based).
  private rotationCycle(dateKey: string): number {
    const [y, m, d] = dateKey.split('-').map(Number);
    const today = new Date(y, m - 1, d).getTime();
    const dayIndex = Math.floor((today - ROTATION_EPOCH.getTime()) / 86400000);
    return Math.floor(dayIndex / this.verses.length) + 1;
  }

  private computeRotationPosition() {
    this.todayPosition = this.rotationIndex(this.todayKey) + 1;
    this.todayCycle = this.rotationCycle(this.todayKey);
  }

  // jw.org study bible deep link. Anchor format: v + book(40) + chapter(3) + verse(3).
  private buildLink(chapter: number, verse: number): string {
    const pad = (n: number) => String(n).padStart(3, '0');
    return `https://www.jw.org/en/library/bible/study-bible/books/matthew/${chapter}/#v40${pad(chapter)}${pad(verse)}`;
  }

  // A completion counts as a fully-passed day when every checklist item of that
  // day's verse is checked. Legacy records (no checkedSteps field) count as passed.
  private isCompletionPassed(c: any): boolean {
    const date = String(c.id).split(KEY_SEPARATOR)[0];
    if (!c.checkedSteps) return true; // legacy single-toggle record
    const verse = this.getVerseForDate(date);
    return verse.checklist.every((item) => c.checkedSteps.includes(item.id));
  }

  private ingestCompletions(completions: any[]) {
    // Refresh today's key/verse in case the app stayed open past midnight.
    this.todayKey = this.util.getLocalDateKey();
    this.todayVerse = this.getVerseForDate(this.todayKey);
    this.computeRotationPosition();

    this.completionsByDate = new Map(
      completions
        .map((c) => [String(c.id).split(KEY_SEPARATOR)[0], c] as [string, any])
        .filter(([d]) => !!d),
    );

    this.passedDates = new Set(
      completions
        .filter((c) => this.isCompletionPassed(c))
        .map((c) => String(c.id).split(KEY_SEPARATOR)[0])
        .filter((d) => !!d),
    );

    // Don't clobber optimistic local state while writes are pending.
    if (this.writesInFlight === 0) {
      const todayDoc = completions.find((c) => String(c.id) === this.todayKey);
      this.todayChecked = new Set<string>(
        todayDoc?.checkedSteps ??
          // Legacy record with no checklist -> treat all items as done.
          (todayDoc ? this.todayVerse.checklist.map((i) => i.id) : []),
      );
    }

    this.recalculateToday();
    this.computeStats();
    this.buildCalendar();

    // Keep an open day-detail view in sync with fresh data, unless the user is
    // mid-write (don't clobber the optimistic state).
    if (this.selectedDate && this.writesInFlight === 0) {
      this.buildSelected(this.selectedDate);
    }
  }

  // ----- Calendar day detail -----

  private buildSelected(dateKey: string) {
    const verse = this.getVerseForDate(dateKey);
    const completion = this.completionsByDate.get(dateKey);
    const checked: string[] = completion?.checkedSteps
      ? completion.checkedSteps
      : completion // legacy record with no checklist -> all done
        ? verse.checklist.map((i) => i.id)
        : [];

    this.selectedDate = dateKey;
    this.selectedVerse = verse;
    this.selectedChecked = new Set(checked);
    this.selectedPassed = this.passedDates.has(dateKey);
    const [y, m, d] = dateKey.split('-').map(Number);
    this.selectedDateLabel = new Date(y, m - 1, d).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  selectDay(cell: CalendarCell | null) {
    if (!cell || cell.isFuture) return;
    this.buildSelected(cell.key);
    // Lock body scroll once while the sheet is open (don't double-count when
    // switching days with the sheet already open).
    if (!this.detailOpen) {
      this.detailOpen = true;
      this.modal.openModal();
    }
  }

  closeSelected() {
    this.selectedDate = null;
    this.selectedVerse = null;
    if (this.detailOpen) {
      this.detailOpen = false;
      this.modal.closeModal();
    }
  }

  isSelectedStepDone(item: ChecklistItem): boolean {
    return this.selectedChecked.has(item.id);
  }

  private recalculateToday() {
    const total = this.todayVerse?.checklist.length ?? 0;
    const done =
      this.todayVerse?.checklist.filter((i) => this.todayChecked.has(i.id))
        .length ?? 0;
    this.todayProgressPercent = total > 0 ? Math.round((done / total) * 100) : 0;
    this.passedToday = total > 0 && done === total;
  }

  isStepDone(item: ChecklistItem): boolean {
    return this.todayChecked.has(item.id);
  }

  // Persist a day's checklist state. Deletes the record when nothing is checked.
  // Fire-and-forget: with Firestore's offline cache, the write promise only
  // resolves after a server round-trip, so blocking the UI on it would hang the
  // checkbox. The optimistic update + real-time listener give instant feedback.
  private persistDay(dateKey: string, verse: Verse, checked: Set<string>) {
    const checkedSteps = verse.checklist
      .map((i) => i.id)
      .filter((id) => checked.has(id));

    this.writesInFlight++;
    const write =
      checkedSteps.length === 0
        ? this.api.unmarkMissionComplete(dateKey)
        : this.api.markMissionComplete(dateKey, {
            missionId: this.mission.id,
            date: dateKey,
            verseKey: verse.key,
            reference: verse.reference,
            chapter: verse.chapter,
            verseNum: verse.verseNum,
            step: verse.step,
            checkedSteps,
            passed: checkedSteps.length === verse.checklist.length,
            completedAt: new Date().toISOString(),
          });

    write
      .catch((error) => console.error('Error saving mission step:', error))
      .finally(() => {
        this.writesInFlight = Math.max(0, this.writesInFlight - 1);
      });
  }

  toggleStep(item: ChecklistItem) {
    if (!this.todayVerse) return;

    const wasPassed = this.passedToday;
    // Optimistic local update.
    if (this.todayChecked.has(item.id)) this.todayChecked.delete(item.id);
    else this.todayChecked.add(item.id);
    this.recalculateToday();
    // Keep an open detail view of today in sync.
    if (this.selectedDate === this.todayKey) {
      this.selectedChecked = new Set(this.todayChecked);
      this.selectedPassed = this.passedToday;
    }
    // Celebrate the moment it flips to fully passed.
    if (!wasPassed && this.passedToday) this.celebrate(this.streakIncludingToday());

    this.persistDay(this.todayKey, this.todayVerse, new Set(this.todayChecked));
  }

  toggleSelectedStep(item: ChecklistItem) {
    if (!this.selectedVerse || !this.selectedDate) return;
    const dateKey = this.selectedDate;
    const verse = this.selectedVerse;

    const wasPassed = this.selectedPassed;
    // Optimistic local update.
    if (this.selectedChecked.has(item.id)) this.selectedChecked.delete(item.id);
    else this.selectedChecked.add(item.id);
    this.selectedPassed = verse.checklist.every((i) =>
      this.selectedChecked.has(i.id),
    );
    // If editing today, keep the top card in sync too.
    if (dateKey === this.todayKey) {
      this.todayChecked = new Set(this.selectedChecked);
      this.recalculateToday();
    }
    // Celebrate the moment this day flips to fully passed.
    if (!wasPassed && this.selectedPassed) {
      this.celebrate(dateKey === this.todayKey ? this.streakIncludingToday() : 0);
    }

    this.persistDay(dateKey, verse, new Set(this.selectedChecked));
  }

  // ----- Habit stats: streaks + milestones -----

  private computeStats() {
    this.totalPassed = this.passedDates.size;
    this.currentStreak = this.calcCurrentStreak();
    this.longestStreak = this.calcLongestStreak();
    // Highest milestone the current streak has reached (100, then 30, then 7).
    this.currentMilestone =
      this.milestones.find((m) => this.currentStreak >= m) ?? null;
  }

  // Shift a YYYY-MM-DD key by a number of days (handles month/year rollover).
  private dayKeyOffset(baseKey: string, offsetDays: number): string {
    const [y, m, d] = baseKey.split('-').map(Number);
    return this.util.getLocalDateKey(new Date(y, m - 1, d + offsetDays));
  }

  // Consecutive passed days ending today. If today isn't passed yet, count from
  // yesterday so the streak doesn't read 0 just because today is still pending.
  private calcCurrentStreak(): number {
    let cursor = this.passedDates.has(this.todayKey)
      ? this.todayKey
      : this.dayKeyOffset(this.todayKey, -1);
    let streak = 0;
    while (this.passedDates.has(cursor)) {
      streak++;
      cursor = this.dayKeyOffset(cursor, -1);
    }
    return streak;
  }

  private calcLongestStreak(): number {
    if (this.passedDates.size === 0) return 0;
    const keys = Array.from(this.passedDates).sort(); // YYYY-MM-DD sorts chronologically
    let longest = 1;
    let run = 1;
    for (let i = 1; i < keys.length; i++) {
      run = this.dayKeyOffset(keys[i - 1], 1) === keys[i] ? run + 1 : 1;
      longest = Math.max(longest, run);
    }
    return longest;
  }

  // ----- Calendar history -----

  private firstOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private buildCalendar() {
    const year = this.viewMonth.getFullYear();
    const month = this.viewMonth.getMonth();
    const startWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: (CalendarCell | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const key = this.util.getLocalDateKey(new Date(year, month, d));
      cells.push({
        day: d,
        key,
        passed: this.passedDates.has(key),
        isToday: key === this.todayKey,
        isFuture: key > this.todayKey,
      });
    }
    this.calendarCells = cells;
    this.monthLabel = this.viewMonth.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
    this.passedCount = cells.filter((c) => c && c.passed).length;
  }

  prevMonth() {
    this.viewMonth = new Date(
      this.viewMonth.getFullYear(),
      this.viewMonth.getMonth() - 1,
      1,
    );
    this.buildCalendar();
  }

  nextMonth() {
    this.viewMonth = new Date(
      this.viewMonth.getFullYear(),
      this.viewMonth.getMonth() + 1,
      1,
    );
    this.buildCalendar();
  }

  get canGoNext(): boolean {
    // Don't navigate past the current month.
    const now = new Date();
    return (
      this.viewMonth.getFullYear() < now.getFullYear() ||
      (this.viewMonth.getFullYear() === now.getFullYear() &&
        this.viewMonth.getMonth() < now.getMonth())
    );
  }
}
