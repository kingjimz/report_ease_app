import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewChecked,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ChatService } from '../../_services/chat.service';
import { NavigationService } from '../../_services/navigation.service';

@Component({
  selector: 'app-chatbot-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chatbot-widget.component.html',
  styleUrl: './chatbot-widget.component.css',
})
export class ChatbotWidgetComponent
  implements OnInit, OnDestroy, AfterViewChecked
{
  @ViewChild('scrollArea') private scrollArea?: ElementRef<HTMLElement>;

  open = false;
  draft = '';
  /** Mirrors the bottom tab bar so the launcher rides up/down with it. */
  barVisible = true;
  /** "Need help?" nudge — shown briefly, once per session. */
  showLabel = false;
  private shouldScroll = false;
  private barSub?: Subscription;
  private labelTimers: any[] = [];
  /** Scroll position captured when we lock the body (mobile full-screen panel). */
  private savedScrollY = 0;
  private scrollLocked = false;
  private static readonly LABEL_SEEN_KEY = 're_chat_label_seen';

  /** A few one-tap starters shown while the thread is fresh. */
  readonly starters = [
    'How do I log my hours?',
    'How do I add a Bible study?',
    'How do I set a goal?',
    'How do I install the app?',
  ];

  constructor(
    public chat: ChatService,
    private navigation: NavigationService,
  ) {}

  ngOnInit(): void {
    this.barSub = this.navigation.tabBarVisible$.subscribe(
      (visible) => (this.barVisible = visible),
    );
    this.scheduleHelpNudge();
  }

  ngOnDestroy(): void {
    this.barSub?.unsubscribe();
    this.labelTimers.forEach((t) => clearTimeout(t));
    this.unlockBodyScroll();
  }

  /**
   * Show the "Need help?" label once per session: ~1s after load it slides out,
   * stays ~5s, then tucks back behind the button. A returning user this session
   * won't see it again.
   */
  private scheduleHelpNudge(): void {
    let seen = false;
    try {
      seen = !!sessionStorage.getItem(ChatbotWidgetComponent.LABEL_SEEN_KEY);
    } catch {
      /* sessionStorage unavailable — just show it this once */
    }
    if (seen) return;

    this.labelTimers.push(setTimeout(() => (this.showLabel = true), 1000));
    this.labelTimers.push(
      setTimeout(() => {
        this.showLabel = false;
        try {
          sessionStorage.setItem(ChatbotWidgetComponent.LABEL_SEEN_KEY, '1');
        } catch {
          /* ignore */
        }
      }, 6000),
    );
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  toggle(): void {
    this.open = !this.open;
    if (this.open) {
      this.shouldScroll = true;
      this.lockBodyScroll();
    } else {
      this.unlockBodyScroll();
    }
  }

  /**
   * On mobile the panel is a full-screen overlay. Focusing the input pops the
   * on-screen keyboard, which scrolls the underlying document to reveal the
   * field — dragging the sticky app header out of view with no way back.
   * Pinning the body in place while open keeps the header put; we restore the
   * exact scroll position on close. Desktop shows a small floating box with no
   * overlay, so we leave its scrolling alone.
   */
  private lockBodyScroll(): void {
    if (this.scrollLocked) return;
    if (typeof window === 'undefined' || window.innerWidth >= 640) return;
    this.savedScrollY = window.scrollY;
    const body = document.body;
    body.style.position = 'fixed';
    body.style.top = `-${this.savedScrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    this.scrollLocked = true;
  }

  private unlockBodyScroll(): void {
    if (!this.scrollLocked) return;
    const body = document.body;
    body.style.position = '';
    body.style.top = '';
    body.style.left = '';
    body.style.right = '';
    body.style.width = '';
    window.scrollTo(0, this.savedScrollY);
    this.scrollLocked = false;
  }

  /** Only show starter chips before the user has asked anything. */
  get showStarters(): boolean {
    return this.chat.messages.length <= 1 && !this.chat.loading;
  }

  async sendDraft(): Promise<void> {
    const text = this.draft;
    this.draft = '';
    await this.dispatch(text);
  }

  async sendStarter(question: string): Promise<void> {
    await this.dispatch(question);
  }

  /** Wipe the whole thread (persisted too) after a quick confirm. */
  clearAll(): void {
    if (this.chat.messages.length > 1) {
      const ok =
        typeof window === 'undefined' ||
        window.confirm('Clear all chats? This cannot be undone.');
      if (!ok) return;
    }
    this.chat.clearAll();
    this.shouldScroll = true;
  }

  private async dispatch(text: string): Promise<void> {
    if (!text.trim() || this.chat.loading) return;
    this.shouldScroll = true;
    await this.chat.send(text);
    this.shouldScroll = true;
  }

  private scrollToBottom(): void {
    const el = this.scrollArea?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }
}
