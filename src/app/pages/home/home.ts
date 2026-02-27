import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  inject,
  signal,
  computed,
  effect,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Auth, onAuthStateChanged, signOut, User } from '@angular/fire/auth';
import { Database, ref, set, get, child, push } from '@angular/fire/database';

interface ChatMessage {
  id: string;
  role: 'user' | 'bot';
  content: string;
  htmlContent: string;
  cssContent: string;
  tsContent: string;
  timestamp?: Date;
  isTyping?: boolean;
  typingStep?: 'html' | 'css' | 'ts' | 'done';
  visibleHtml?: string;
  visibleCss?: string;
  visibleTs?: string;
}

interface HistoryItem {
  id: string;
  label: string;
  timestamp: Date;
  messages: ChatMessage[];
}

interface HistoryGroups {
  today: HistoryItem[];
  yesterday: HistoryItem[];
  older: HistoryItem[];
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './home.html',
  styleUrls: ['./home.css'],
})
export class Home implements OnInit {
  // ─── DI ─────────────────────────────────────────────────
  private auth = inject(Auth);
  private db = inject(Database);

  // ─── Signals ────────────────────────────────────────────
  currentUser = signal<User | null>(null);
  isAuthLoading = signal(true);
  messages = signal<ChatMessage[]>([]);
  isLoading = signal(false);
  showModal = signal(false);
  copySuccess = signal(false);
  sidebarCollapsed = signal(false);
  selectedHistoryId = signal<string | null>(null);
  historyItems = signal<HistoryItem[]>([]);
  showPreview = signal(false);
  previewHtmlContent = signal('');
  previewCssContent = signal('');
  previewTsContent = signal('');
  previewIframeSrc = signal<SafeResourceUrl | null>(null);
  previewTab = signal<'preview' | 'html' | 'css' | 'ts'>('preview');
  previewCode = signal('');
  userInstruction = '';
  selectedImage: File | null = null;
  imagePreview: string | ArrayBuffer | null = null;
  usedCredits = signal(0);

  // ─── Computed ────────────────────────────────────────────
  freeCredits = computed(() => (this.currentUser() ? 25 : 3));
  creditsLeft = computed(() => this.freeCredits() - this.usedCredits());

  historyGroups = computed<HistoryGroups>(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);
    const items = this.historyItems();
    return {
      today: items.filter(h => new Date(h.timestamp) >= todayStart),
      yesterday: items.filter(h => {
        const d = new Date(h.timestamp);
        return d >= yesterdayStart && d < todayStart;
      }),
      older: items.filter(h => new Date(h.timestamp) < yesterdayStart),
    };
  });

  // ─── Misc ─────────────────────────────────────────────────
  private readonly CHARS_PER_TICK = 10;
  private readonly TICK_MS = 16;
  @ViewChild('chatMessages') chatMessagesRef!: ElementRef;

  constructor(
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    onAuthStateChanged(this.auth, async (user) => {
      this.currentUser.set(user);
      this.isAuthLoading.set(false);

      if (user) {
        await this.loadHistoryFromDB(user.uid);
      } else {
        this.messages.set([]);
        this.usedCredits.set(0);
        this.historyItems.set([]);
      }
    });
  }

  // ─── History (Firebase Realtime DB) ───────────────────────

  private async loadHistoryFromDB(uid: string): Promise<void> {
    try {
      const snapshot = await get(child(ref(this.db), `history/${uid}`));
      if (snapshot.exists()) {
        const data = snapshot.val();
        const items: HistoryItem[] = Object.entries(data)
          .map(([id, val]: [string, any]) => ({
            id,
            label: val.label,
            timestamp: new Date(val.timestamp),
            messages: (val.messages || []).map((m: any, i: number) => ({
              ...m,
              id: m.id || `hist_${id}_${i}`,
              timestamp: m.timestamp ? new Date(m.timestamp) : undefined,
              // Reset typing state when loading from DB
              isTyping: false,
              typingStep: 'done' as const,
              visibleHtml: undefined,
              visibleCss: undefined,
              visibleTs: undefined,
            })),
          }))
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

        this.historyItems.set(items);
        if (items.length > 0) {
          this.messages.set(items[0].messages);
          this.selectedHistoryId.set(items[0].id);
          const totalBotMsgs = items.reduce(
            (sum, h) => sum + h.messages.filter(m => m.role === 'bot').length,
            0
          );
          this.usedCredits.set(totalBotMsgs);
        }
      }
    } catch (err) {
      console.error('Error loading history:', err);
    }
  }

  private async saveHistoryToDB(): Promise<void> {
    const user = this.currentUser();
    if (!user) return;
    try {
      const items = this.historyItems();
      const data: Record<string, any> = {};
      for (const item of items) {
        data[item.id] = {
          label: item.label,
          timestamp: item.timestamp.toISOString(),
          messages: item.messages.map(m => ({
            ...m,
            timestamp: m.timestamp ? m.timestamp.toISOString() : null,
          })),
        };
      }
      await set(ref(this.db, `history/${user.uid}`), data);
    } catch (err) {
      console.error('Error saving history:', err);
    }
  }

  async clearHistory(): Promise<void> {
    const user = this.currentUser();
    if (user) {
      await set(ref(this.db, `history/${user.uid}`), null);
    }
    this.historyItems.set([]);
    this.messages.set([]);
    this.usedCredits.set(0);
    this.showPreview.set(false);
    this.selectedHistoryId.set(null);
  }

  loadHistoryItem(item: HistoryItem): void {
    this.selectedHistoryId.set(item.id);
    this.messages.set(item.messages);
    this.showPreview.set(false);
  }

  newChat(): void {
    this.messages.set([]);
    this.selectedHistoryId.set(null);
    this.showPreview.set(false);
    this.selectedImage = null;
    this.imagePreview = null;
    this.userInstruction = '';
  }

  getBotIndex(msgIndex: number): number {
    return this.messages().slice(0, msgIndex + 1).filter(m => m.role === 'bot').length;
  }

  // ─── Auth ──────────────────────────────────────────────────

  async logout(): Promise<void> {
    await signOut(this.auth);
    this.messages.set([]);
    this.usedCredits.set(0);
    this.historyItems.set([]);
    this.showPreview.set(false);
  }

  goToLogin(): void { window.location.href = '/Login'; }
  goToRegister(): void { window.location.href = '/Registro'; }

  // ─── File ─────────────────────────────────────────────────

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Solo se permiten imágenes'); return; }
    this.selectedImage = file;
    const reader = new FileReader();
    reader.onload = () => { this.imagePreview = reader.result; };
    reader.readAsDataURL(file);
  }

  removeImage(): void {
    this.selectedImage = null;
    this.imagePreview = null;
  }

  // ─── Generación ────────────────────────────────────────────

  sendImage(): void {
    if (!this.selectedImage) return;
    if (this.creditsLeft() <= 0) { this.showModal.set(true); return; }
    if (this.isLoading()) return;

    this.isLoading.set(true);

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_u`,
      role: 'user',
      content: this.userInstruction || `Imagen: ${this.selectedImage.name}`,
      htmlContent: '', cssContent: '', tsContent: '',
      timestamp: new Date(),
    };

    this.messages.update(msgs => [...msgs, userMsg]);
    this.scrollToBottom();

    const formData = new FormData();
    formData.append('file', this.selectedImage);
    formData.append('instruction', this.userInstruction);

    this.http.post<{ html: string; css: string; ts: string }>(
      'https://backen-bayron-788289092522.us-central1.run.app/generate',
      formData
    ).subscribe({
      next: (response) => {
        this.usedCredits.update(c => c + 1);

        const html = response.html ?? '';
        const css  = response.css  ?? '';
        const ts   = response.ts   ?? '';

        console.log('[CodeVision] Response received:', {
          htmlLen: html.length, cssLen: css.length, tsLen: ts.length,
          htmlPreview: html.slice(0, 80)
        });

        const msgId = `msg_${Date.now()}_b`;
        const newMsg: ChatMessage = {
          id: msgId,
          role: 'bot',
          content: `<style>${css}</style>${html}`,
          htmlContent: html,
          cssContent: css,
          tsContent: ts,
          timestamp: new Date(),
          isTyping: true,
          typingStep: 'html',
          visibleHtml: '',
          visibleCss: '',
          visibleTs: '',
        };

        // 1. Add message to array
        this.messages.update(msgs => [...msgs, newMsg]);

        // 2. Open preview
        this.openPreview(html, css, ts);

        // 3. Reset UI state
        this.isLoading.set(false);
        this.selectedImage = null;
        this.imagePreview = null;
        this.userInstruction = '';
        this.scrollToBottom();

        // 4. Save history AFTER animation starts (avoid overwriting signal)
        setTimeout(() => this.saveToHistory(), 100);

        // 5. Start typing animation - uses id to find and update msg in signal
        this.startTypingAnimation(newMsg);
      },
      error: (err) => {
        console.error(err);
        this.isLoading.set(false);
      }
    });
  }

  private saveToHistory(): void {
    const label = this.messages().find(m => m.role === 'user')?.content?.slice(0, 40) || 'Generación';
    const sessionId = this.selectedHistoryId() ?? `session_${Date.now()}`;

    if (this.selectedHistoryId()) {
      this.historyItems.update(items =>
        items.map(h => h.id === this.selectedHistoryId()
          ? { ...h, messages: [...this.messages()] }
          : h
        )
      );
    } else {
      this.selectedHistoryId.set(sessionId);
      this.historyItems.update(items => [{
        id: sessionId,
        label,
        timestamp: new Date(),
        messages: [...this.messages()],
      }, ...items]);
    }

    if (this.currentUser()) {
      this.saveHistoryToDB();
    }
  }

  // ─── Typing Animation ──────────────────────────────────────

  getVisibleCode(msg: ChatMessage, field: 'html' | 'css' | 'ts'): string {
    // Always read from the signal to get the latest state
    const live = this.messages().find(m => m.id === msg.id) ?? msg;

    const content = field === 'html' ? live.htmlContent
                  : field === 'css'  ? live.cssContent
                  : live.tsContent;

    if (!content) return '';

    const trunc = (s: string) =>
      s.length > 400 ? s.slice(0, 400) + '\n\n... (' + (s.length - 400) + ' chars más)' : s;

    if (!live.isTyping || live.typingStep === 'done') {
      return trunc(content);
    }

    if (live.typingStep === field) {
      const visible = field === 'html' ? (live.visibleHtml ?? '')
                    : field === 'css'  ? (live.visibleCss ?? '')
                    : (live.visibleTs ?? '');
      return visible;
    }

    const order: Array<'html' | 'css' | 'ts'> = ['html', 'css', 'ts'];
    const currentIdx = order.indexOf(live.typingStep as 'html' | 'css' | 'ts');
    const fieldIdx = order.indexOf(field);
    if (fieldIdx < currentIdx) return trunc(content);

    return '';
  }

  private updateMsg(target: ChatMessage, patch: Partial<ChatMessage>): void {
    this.messages.update(msgs =>
      msgs.map(m => m.id === target.id ? { ...m, ...patch } : m)
    );
    // Keep target in sync so animation callbacks work
    Object.assign(target, patch);
  }

  private startTypingAnimation(msg: ChatMessage): void {
    this.animateField(msg, 'html', msg.htmlContent, () => {
      this.animateField(msg, 'css', msg.cssContent, () => {
        this.animateField(msg, 'ts', msg.tsContent, () => {
          this.updateMsg(msg, { isTyping: false, typingStep: 'done' });
          this.scrollToBottom();
        });
      });
    });
  }

  private animateField(
    msg: ChatMessage,
    field: 'html' | 'css' | 'ts',
    fullText: string,
    onDone: () => void
  ): void {
    if (!fullText) { onDone(); return; }

    // Update step indicator
    this.updateMsg(msg, { typingStep: field });

    const preview = fullText.length > 400 ? fullText.slice(0, 400) : fullText;
    let idx = 0;

    const tick = () => {
      idx = Math.min(idx + this.CHARS_PER_TICK, preview.length);
      const visible = preview.slice(0, idx);

      const patch: Partial<ChatMessage> =
        field === 'html' ? { visibleHtml: visible }
      : field === 'css'  ? { visibleCss: visible }
      : { visibleTs: visible };

      this.updateMsg(msg, patch);
      this.scrollToBottom();

      if (idx < preview.length) {
        setTimeout(tick, this.TICK_MS);
      } else {
        setTimeout(onDone, 150);
      }
    };

    tick();
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      try {
        const el = this.chatMessagesRef?.nativeElement;
        if (el) {
          el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        }
      } catch {}
    }, 50);
  }

  // ─── Preview ───────────────────────────────────────────────

  openPreview(html: string, css: string, ts: string): void {
    this.previewHtmlContent.set(html);
    this.previewCssContent.set(css);
    this.previewTsContent.set(ts);
    const code = `<style>${css}</style>${html}`;
    this.previewCode.set(code);
    this.previewTab.set('preview');
    this.showPreview.set(true);
    const blob = new Blob([code], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    this.previewIframeSrc.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
  }

  closePreview(): void { this.showPreview.set(false); }
  closeModal(): void { this.showModal.set(false); }

  copyToClipboard(text: string): void { navigator.clipboard.writeText(text); }

  getLineCount(code: string): number { return code ? code.split('\n').length : 0; }

  copyCode(): void {
    const tab = this.previewTab();
    const text =
      tab === 'html' ? this.previewHtmlContent() :
      tab === 'css'  ? this.previewCssContent()  :
      tab === 'ts'   ? this.previewTsContent()   :
      this.previewCode();

    navigator.clipboard.writeText(text).then(() => {
      this.copySuccess.set(true);
      setTimeout(() => this.copySuccess.set(false), 2000);
    });
  }

  openInNewTab(): void {
    const win = window.open('', '_blank');
    if (win) { win.document.write(this.previewCode()); win.document.close(); }
  }
}