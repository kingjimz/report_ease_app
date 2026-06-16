import { Injectable } from '@angular/core';
import { UtilService } from './util.service';

export interface ChecklistItem {
  id: string; // stable id, e.g. "mt-5-44-s0"
  text: string;
}

export interface Verse {
  key: string; // verse part of the doc ID, e.g. "mt-5-44"
  chapter: number;
  verseNum: number;
  reference: string; // e.g. "Matthew 5:44"
  label: string; // short action summary of the practice
  step: string; // one-line description of the practice
  checklist: ChecklistItem[]; // concrete steps to pass the day
  link: string; // jw.org study bible deep link
}

export interface PracticeSummary {
  verse: Verse;
  doneSteps: number;
  totalSteps: number;
  progressPercent: number;
  passed: boolean;
  position: number; // 1-based position in the rotation
  cycle: number; // which loop through the full set
  currentStreak: number;
  longestStreak: number;
  totalPassed: number;
}

// Curated list of the direct, actionable commands in the Sermon on the Mount.
// `label` is a brief summary, `step` the one-line practice, and `checklist` the
// concrete actions a user works through to live the verse out and pass the day.
export const MISSION_VERSES: {
  chapter: number;
  verseNum: number;
  label: string;
  step: string;
  checklist: string[];
}[] = [
  // Matthew 5
  { chapter: 5, verseNum: 16, label: 'Let your light shine through fine works', step: 'Do one visible good deed today that reflects well on God, without seeking credit.', checklist: ['Pick one good work others may notice', 'Carry it out for the right reason, not for praise', 'Give the credit to God if asked'] },
  { chapter: 5, verseNum: 22, label: "Don't hold onto anger against others", step: 'Let go of anger before it takes root.', checklist: ['Notice the moment irritation rises', 'Pause and breathe before reacting', 'Let the grudge go and move on calmly'] },
  { chapter: 5, verseNum: 24, label: 'Make peace before offering your gift', step: 'Take a step toward peace with someone before worship.', checklist: ['Identify someone you have tension with', 'Reach out to them today', 'Take one step to repair the relationship'] },
  { chapter: 5, verseNum: 25, label: 'Settle disputes quickly', step: 'Resolve an open disagreement without delay.', checklist: ['Name the unresolved conflict', 'Contact the other person promptly', 'Propose a fair way to settle it'] },
  { chapter: 5, verseNum: 28, label: 'Guard your heart against lust', step: 'Redirect your thoughts and guard what you look at.', checklist: ['Notice when a tempting thought or image appears', 'Look away or close it immediately', 'Replace it with a wholesome thought'] },
  { chapter: 5, verseNum: 29, label: 'Remove what makes you stumble (the eye)', step: 'Cut out one thing you look at that trips you up.', checklist: ['Identify one thing you watch that trips you up', 'Remove or block your access to it today', 'Decide what to do instead'] },
  { chapter: 5, verseNum: 30, label: 'Remove what makes you stumble (the hand)', step: 'Stop one habit that leads you toward wrong.', checklist: ['Identify one habit that leads you to wrong', 'Take a concrete step to stop it today', 'Plan a better action to replace it'] },
  { chapter: 5, verseNum: 32, label: 'Honor faithfulness in marriage', step: 'Do something that upholds loyalty in marriage.', checklist: ['Reflect on one way to strengthen marital loyalty', 'Do something that shows that commitment', 'Speak respectfully of your spouse and marriage'] },
  { chapter: 5, verseNum: 34, label: "Don't swear oaths", step: 'Let your plain word be enough today.', checklist: ['Make a promise today using plain words', 'Avoid swearing or exaggerating to be believed', 'Keep that promise'] },
  { chapter: 5, verseNum: 37, label: 'Let your Yes mean Yes, your No, No', step: 'Follow through on exactly what you said.', checklist: ['Review what you committed to today', 'Do exactly what you said', "If you can't, tell the person honestly"] },
  { chapter: 5, verseNum: 39, label: "Don't return evil; turn the other cheek", step: 'Refuse to retaliate when wronged.', checklist: ['Notice when someone wrongs or provokes you', 'Choose not to retaliate', 'Respond calmly or walk away'] },
  { chapter: 5, verseNum: 40, label: 'Give freely, even more than asked', step: 'Give generously, beyond what was asked.', checklist: ['Notice a need someone has', "Give what's asked", 'Offer a little more than expected'] },
  { chapter: 5, verseNum: 41, label: 'Go the extra mile', step: 'Do more than what is required for someone.', checklist: ['Identify a task someone needs help with', "Do what's required", 'Add extra effort beyond the minimum'] },
  { chapter: 5, verseNum: 42, label: 'Give to those who ask', step: 'Help someone who asks you today.', checklist: ['Notice someone asking for help today', 'Decide how you can assist', 'Follow through on it'] },
  { chapter: 5, verseNum: 44, label: 'Love your enemies and pray for them', step: 'Pray for and show kindness to someone who wronged you.', checklist: ['Bring to mind someone who wronged you', 'Say a sincere prayer for their good', 'Choose a kind word or act toward them'] },
  { chapter: 5, verseNum: 48, label: 'Be complete in love, as your Father is', step: 'Extend kindness to someone you tend to overlook.', checklist: ['Identify someone you tend to overlook', 'Show them genuine kindness today', 'Treat them as you would a friend'] },
  // Matthew 6
  { chapter: 6, verseNum: 1, label: "Don't do good just to be noticed", step: 'Do a good deed no one will see.', checklist: ['Plan a good deed no one will see', 'Do it quietly', 'Resist the urge to mention it'] },
  { chapter: 6, verseNum: 2, label: 'Give without fanfare', step: 'Give to someone in need quietly.', checklist: ['Find someone in need', 'Give discreetly', "Don't announce or post about it"] },
  { chapter: 6, verseNum: 3, label: 'Keep your giving discreet', step: 'Help someone and keep it between you.', checklist: ['Help someone today', 'Keep it between you and them', 'Let it go without seeking thanks'] },
  { chapter: 6, verseNum: 5, label: "Don't pray to be seen by others", step: 'Pray to connect with God, not to be seen.', checklist: ['Find a private moment to pray', 'Focus on God, not on appearances', 'Pray sincerely'] },
  { chapter: 6, verseNum: 6, label: 'Pray privately to your Father', step: 'Set aside private time for personal prayer.', checklist: ['Set aside a quiet time and place', 'Pray personally to God', "Share what's truly on your heart"] },
  { chapter: 6, verseNum: 7, label: "Don't pray with empty repetition", step: 'Pray with heartfelt, specific words.', checklist: ['Think about what you really want to say', 'Pray with specific, heartfelt words', 'Avoid rote phrases'] },
  { chapter: 6, verseNum: 9, label: 'Pray as Jesus taught', step: 'Use the model prayer as your outline.', checklist: ['Read Matthew 6:9-13', 'Use its themes as your outline', 'Pray through each point in your own words'] },
  { chapter: 6, verseNum: 14, label: 'Forgive others their trespasses', step: 'Forgive someone for what they did.', checklist: ["Recall an offense you're holding onto", 'Decide to forgive it', 'Let go of any resentment'] },
  { chapter: 6, verseNum: 16, label: "Don't make a show of fasting", step: 'Make a sacrifice without drawing attention.', checklist: ['Carry out a personal sacrifice today', 'Keep your normal appearance', "Don't draw attention to it"] },
  { chapter: 6, verseNum: 17, label: 'Stay composed when fasting', step: 'Keep a normal, positive demeanor while denying yourself.', checklist: ['Keep a cheerful, normal demeanor', "Don't complain about what you're denying yourself", 'Stay focused on the purpose'] },
  { chapter: 6, verseNum: 19, label: 'Stop storing up earthly treasures', step: 'Resist a material want and refocus on what lasts.', checklist: ['Notice a material want today', 'Resist buying or chasing it', 'Refocus on something lasting'] },
  { chapter: 6, verseNum: 20, label: 'Store up treasures in heaven', step: 'Do one spiritual act that builds your faith.', checklist: ['Choose one spiritual act for today', 'Do it', 'Note how it built your faith'] },
  { chapter: 6, verseNum: 24, label: 'Serve God, not riches', step: 'Put God ahead of money in one choice.', checklist: ['Spot a choice between God and money', "Choose God's interests", 'Act on that choice'] },
  { chapter: 6, verseNum: 25, label: 'Stop being anxious about your life', step: 'Hand your worry over to God in prayer.', checklist: ["Name what you're anxious about", 'Pray and hand it to God', 'Take the next practical step calmly'] },
  { chapter: 6, verseNum: 31, label: "Don't worry about food or clothing", step: 'Trust God for your needs and avoid anxious over-planning.', checklist: ['Notice anxious thoughts about needs', 'Remind yourself God provides', 'Avoid over-planning out of fear'] },
  { chapter: 6, verseNum: 33, label: 'Seek first the Kingdom', step: 'Put a spiritual priority ahead of personal pursuits.', checklist: ['Identify a spiritual priority for today', 'Put it before personal pursuits', 'Act on it first'] },
  { chapter: 6, verseNum: 34, label: "Don't be anxious about tomorrow", step: "Focus on today and leave tomorrow's worries for tomorrow.", checklist: ["List today's tasks only", "Focus on what's in front of you", "Leave tomorrow's worries for tomorrow"] },
  // Matthew 7
  { chapter: 7, verseNum: 1, label: 'Stop judging others', step: 'Give someone the benefit of the doubt.', checklist: ['Catch a judgmental thought', 'Give the person the benefit of the doubt', 'Choose understanding over criticism'] },
  { chapter: 7, verseNum: 5, label: 'Correct yourself before others', step: 'Work on your own fault before noting others.', checklist: ['Name one of your own faults', 'Work on it today', "Hold back from pointing out others'"] },
  { chapter: 7, verseNum: 6, label: "Don't waste what is holy", step: 'Share spiritual things with someone open to them.', checklist: ['Find someone open to spiritual things', 'Share something meaningful with them', "Don't force it on the unwilling"] },
  { chapter: 7, verseNum: 7, label: 'Keep asking, seeking, knocking', step: 'Be persistent in prayer about something important.', checklist: ['Identify something important to pray about', 'Pray about it earnestly', 'Keep at it persistently'] },
  { chapter: 7, verseNum: 12, label: 'Treat others as you want to be treated', step: 'Treat one person how you would want to be treated.', checklist: ['Pick one interaction today', "Ask how you'd want to be treated", 'Treat them that way'] },
  { chapter: 7, verseNum: 13, label: 'Enter through the narrow gate', step: 'Choose the harder right path over the easy one.', checklist: ['Spot an easy-but-wrong option today', 'Choose the harder right path', 'Follow through'] },
  { chapter: 7, verseNum: 15, label: 'Be on guard against false teachers', step: 'Check something you heard against the Scriptures.', checklist: ['Notice a claim or belief you heard', 'Check it against the Scriptures', 'Accept or reject it accordingly'] },
];

// Composite-id separator (legacy "date__verse" doc ids).
export const KEY_SEPARATOR = '__';
// Fixed reference date for rotating the verse-of-the-day. Local midnight.
export const ROTATION_EPOCH = new Date(2025, 0, 1);
// Streak milestones, highest first.
export const PRACTICE_MILESTONES = [100, 30, 7];

/**
 * Single source of truth for the daily practice (Sermon on the Mount rotation).
 * Both the dedicated practice page and the dashboard summary read from this so
 * the verse data and rotation never drift between them.
 */
@Injectable({ providedIn: 'root' })
export class MissionService {
  readonly verses: Verse[] = MISSION_VERSES.map((m) => {
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
    };
  });

  readonly count = this.verses.length;

  constructor(private util: UtilService) {}

  // jw.org study bible deep link. Anchor format: v + book(40) + chapter(3) + verse(3).
  private buildLink(chapter: number, verse: number): string {
    const pad = (n: number) => String(n).padStart(3, '0');
    return `https://www.jw.org/en/library/bible/study-bible/books/matthew/${chapter}/#v40${pad(chapter)}${pad(verse)}`;
  }

  // Zero-based index into the verse list for a date. Modulo wraps endlessly so
  // the practice never runs out: the day after the final verse returns the first.
  rotationIndex(dateKey: string): number {
    const [y, m, d] = dateKey.split('-').map(Number);
    const day = new Date(y, m - 1, d).getTime();
    const dayIndex = Math.floor((day - ROTATION_EPOCH.getTime()) / 86400000);
    const len = this.verses.length;
    return ((dayIndex % len) + len) % len;
  }

  rotationCycle(dateKey: string): number {
    const [y, m, d] = dateKey.split('-').map(Number);
    const day = new Date(y, m - 1, d).getTime();
    const dayIndex = Math.floor((day - ROTATION_EPOCH.getTime()) / 86400000);
    return Math.floor(dayIndex / this.verses.length) + 1;
  }

  getVerseForDate(dateKey: string): Verse {
    return this.verses[this.rotationIndex(dateKey)];
  }

  // A completion is a fully-passed day when every checklist item of that day's
  // verse is checked. Legacy records (no checkedSteps) count as passed.
  isCompletionPassed(c: any): boolean {
    const date = String(c.id).split(KEY_SEPARATOR)[0];
    if (!c?.checkedSteps) return true;
    const verse = this.getVerseForDate(date);
    return verse.checklist.every((item) => c.checkedSteps.includes(item.id));
  }

  // Set of YYYY-MM-DD dates whose practice was fully passed.
  passedDatesFrom(completions: any[]): Set<string> {
    return new Set(
      (completions || [])
        .filter((c) => this.isCompletionPassed(c))
        .map((c) => String(c.id).split(KEY_SEPARATOR)[0])
        .filter((d) => !!d),
    );
  }

  private dayKeyOffset(baseKey: string, offsetDays: number): string {
    const [y, m, d] = baseKey.split('-').map(Number);
    return this.util.getLocalDateKey(new Date(y, m - 1, d + offsetDays));
  }

  currentStreak(passedDates: Set<string>, todayKey: string): number {
    let cursor = passedDates.has(todayKey)
      ? todayKey
      : this.dayKeyOffset(todayKey, -1);
    let streak = 0;
    while (passedDates.has(cursor)) {
      streak++;
      cursor = this.dayKeyOffset(cursor, -1);
    }
    return streak;
  }

  longestStreak(passedDates: Set<string>): number {
    if (passedDates.size === 0) return 0;
    const keys = Array.from(passedDates).sort();
    let longest = 1;
    let run = 1;
    for (let i = 1; i < keys.length; i++) {
      run = this.dayKeyOffset(keys[i - 1], 1) === keys[i] ? run + 1 : 1;
      longest = Math.max(longest, run);
    }
    return longest;
  }

  milestoneFor(streak: number): number | null {
    return PRACTICE_MILESTONES.find((m) => streak >= m) ?? null;
  }

  // Everything the dashboard summary card needs for today, in one call.
  getTodaySummary(completions: any[]): PracticeSummary {
    const todayKey = this.util.getLocalDateKey();
    const verse = this.getVerseForDate(todayKey);
    const todayDoc = (completions || []).find(
      (c) => String(c.id) === todayKey,
    );
    const checked: string[] = todayDoc?.checkedSteps
      ? todayDoc.checkedSteps
      : todayDoc
        ? verse.checklist.map((i) => i.id)
        : [];
    const totalSteps = verse.checklist.length;
    const doneSteps = verse.checklist.filter((i) =>
      checked.includes(i.id),
    ).length;
    const passedDates = this.passedDatesFrom(completions);

    return {
      verse,
      doneSteps,
      totalSteps,
      progressPercent:
        totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0,
      passed: totalSteps > 0 && doneSteps === totalSteps,
      position: this.rotationIndex(todayKey) + 1,
      cycle: this.rotationCycle(todayKey),
      currentStreak: this.currentStreak(passedDates, todayKey),
      longestStreak: this.longestStreak(passedDates),
      totalPassed: passedDates.size,
    };
  }
}
