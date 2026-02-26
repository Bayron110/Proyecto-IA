import { ChangeDetectorRef, Component, ElementRef, OnInit, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Auth, onAuthStateChanged, signOut, User } from '@angular/fire/auth';
import { inject } from '@angular/core';

interface ChatMessage {
  role: 'user' | 'bot';
  content: string;
  htmlContent: string;
  cssContent: string;
  tsContent: string;
  timestamp?: Date;
  // Typing animation state
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
  imports: [CommonModule, FormsModule],
  templateUrl: './home.html',
  styleUrls: ['./home.css'],
})
export class Home implements OnInit {

  // Auth
  private auth = inject(Auth);
  currentUser: User | null = null;
  isAuthLoading = true;

  // Imagen
  selectedImage: File | null = null;
  imagePreview: string | ArrayBuffer | null = null;

  // Chat
  messages: ChatMessage[] = [];
  isLoading = false;
  showModal = false;
  copySuccess = false;

  // Sidebar
  sidebarCollapsed = false;
  selectedHistoryId: string | null = null;
  historyItems: HistoryItem[] = [];

  get historyGroups(): HistoryGroups {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);

    return {
      today: this.historyItems.filter(h => new Date(h.timestamp) >= todayStart),
      yesterday: this.historyItems.filter(h => {
        const d = new Date(h.timestamp);
        return d >= yesterdayStart && d < todayStart;
      }),
      older: this.historyItems.filter(h => new Date(h.timestamp) < yesterdayStart),
    };
  }

  // Créditos
  get freeCredits(): number {
    return this.currentUser ? 25 : 3;
  }
  usedCredits = 0;

  get creditsLeft(): number {
    return this.freeCredits - this.usedCredits;
  }

  // Preview
  showPreview = false;
  previewCode = '';
  previewHtmlContent = '';
  previewCssContent = '';
  previewTsContent = '';
  previewIframeSrc: SafeResourceUrl | null = null;
  previewTab: 'preview' | 'html' | 'css' | 'ts' = 'preview';
  userInstruction = '';

  // Typing animation config
  private readonly CHARS_PER_TICK = 8; // caracteres por frame
  private readonly TICK_MS = 16;       // ~60fps

  @ViewChild('chatMessages') chatMessagesRef!: ElementRef;

  constructor(
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    onAuthStateChanged(this.auth, (user) => {
      this.currentUser = user;
      this.isAuthLoading = false;

      if (user) {
        this.loadHistory(user.uid);
      } else {
        this.messages = [];
        this.usedCredits = 0;
        this.historyItems = [];
      }

      this.cdr.detectChanges();
    });
  }

  // ─── Typing Animation ───────────────────────────────────────────

  getVisibleCode(msg: ChatMessage, field: 'html' | 'css' | 'ts'): string {
    if (!msg.isTyping) {
      // Mostrar preview truncado cuando ya terminó
      const content = field === 'html' ? msg.htmlContent : field === 'css' ? msg.cssContent : msg.tsContent;
      return content.slice(0, 300) + (content.length > 300 ? '\n...' : '');
    }
    if (msg.typingStep === field) {
      return field === 'html' ? (msg.visibleHtml ?? '') :
             field === 'css'  ? (msg.visibleCss ?? '') :
             (msg.visibleTs ?? '');
    }
    if (this.isStepCompleted(msg, field)) {
      const content = field === 'html' ? msg.htmlContent : field === 'css' ? msg.cssContent : msg.tsContent;
      return content.slice(0, 300) + (content.length > 300 ? '\n...' : '');
    }
    return '';
  }

  private isStepCompleted(msg: ChatMessage, field: 'html' | 'css' | 'ts'): boolean {
    const order = ['html', 'css', 'ts'];
    const currentIdx = order.indexOf(msg.typingStep ?? 'html');
    const fieldIdx = order.indexOf(field);
    return fieldIdx < currentIdx || msg.typingStep === 'done';
  }

  private startTypingAnimation(msg: ChatMessage): void {
    msg.isTyping = true;
    msg.visibleHtml = '';
    msg.visibleCss = '';
    msg.visibleTs = '';

    this.animateField(msg, 'html', msg.htmlContent, () => {
      this.animateField(msg, 'css', msg.cssContent, () => {
        this.animateField(msg, 'ts', msg.tsContent, () => {
          msg.isTyping = false;
          msg.typingStep = 'done';
          this.cdr.detectChanges();
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

    msg.typingStep = field;
    const preview = fullText.slice(0, 300);
    let idx = 0;

    const tick = () => {
      idx = Math.min(idx + this.CHARS_PER_TICK, preview.length);
      const visible = preview.slice(0, idx);

      if (field === 'html') msg.visibleHtml = visible;
      else if (field === 'css') msg.visibleCss = visible;
      else msg.visibleTs = visible;

      this.cdr.detectChanges();
      this.scrollToBottom();

      if (idx < preview.length) {
        setTimeout(tick, this.TICK_MS);
      } else {
        setTimeout(onDone, 200);
      }
    };

    tick();
  }

  private scrollToBottom(): void {
    try {
      const el = this.chatMessagesRef?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    } catch {}
  }

  // ─── Historial ────────────────────────────────────────────────

  private loadHistory(uid: string): void {
    const raw = localStorage.getItem(`history_${uid}`);
    if (raw) {
      try {
        const saved = JSON.parse(raw) as HistoryItem[];
        this.historyItems = saved.map(h => ({
          ...h,
          timestamp: new Date(h.timestamp),
        }));
        // Cargar el más reciente por defecto
        if (this.historyItems.length > 0) {
          const latest = this.historyItems[0];
          this.messages = latest.messages;
          this.selectedHistoryId = latest.id;
          this.usedCredits = this.historyItems.reduce(
            (sum, h) => sum + h.messages.filter(m => m.role === 'bot').length, 0
          );
        }
      } catch {
        this.historyItems = [];
        this.messages = [];
      }
    }
  }

  private saveHistory(): void {
    if (this.currentUser) {
      localStorage.setItem(
        `history_${this.currentUser.uid}`,
        JSON.stringify(this.historyItems)
      );
    }
  }

  clearHistory(): void {
    if (this.currentUser) {
      localStorage.removeItem(`history_${this.currentUser.uid}`);
    }
    this.historyItems = [];
    this.messages = [];
    this.usedCredits = 0;
    this.showPreview = false;
    this.selectedHistoryId = null;
    this.cdr.detectChanges();
  }

  loadHistoryItem(item: HistoryItem): void {
    this.selectedHistoryId = item.id;
    this.messages = item.messages;
    this.showPreview = false;
    this.cdr.detectChanges();
  }

  newChat(): void {
    this.messages = [];
    this.selectedHistoryId = null;
    this.showPreview = false;
    this.selectedImage = null;
    this.imagePreview = null;
    this.userInstruction = '';
    this.cdr.detectChanges();
  }

  getBotIndex(msgIndex: number): number {
    return this.messages.slice(0, msgIndex + 1).filter(m => m.role === 'bot').length;
  }

  // ─── Auth ──────────────────────────────────────────────────────

  async logout(): Promise<void> {
    await signOut(this.auth);
    this.messages = [];
    this.usedCredits = 0;
    this.historyItems = [];
    this.showPreview = false;
    this.cdr.detectChanges();
  }

  goToLogin(): void { window.location.href = '/Login'; }
  goToRegister(): void { window.location.href = '/Registro'; }

  // ─── Imagen ────────────────────────────────────────────────────

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

  // ─── Generación ────────────────────────────────────────────────

  sendImage(): void {
    if (!this.selectedImage) return;
    if (this.usedCredits >= this.freeCredits) { this.showModal = true; return; }
    if (this.isLoading) return;

    this.isLoading = true;

    // Mensaje usuario
    const userMsg: ChatMessage = {
      role: 'user',
      content: this.userInstruction || `Imagen: ${this.selectedImage.name}`,
      htmlContent: '', cssContent: '', tsContent: '',
    };
    this.messages.push(userMsg);

    const formData = new FormData();
    formData.append('file', this.selectedImage);
    formData.append('instruction', this.userInstruction);

    this.http.post<{ html: string; css: string; ts: string }>(
      'https://backen-bayron-788289092522.us-central1.run.app/generate',
      formData
    ).subscribe({
      next: (response) => {
        this.usedCredits++;

        const html = response.html ?? '';
        const css  = response.css  ?? '';
        const ts   = response.ts   ?? '';

        const newMsg: ChatMessage = {
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

        this.messages.push(newMsg);

        // Guardar en historial
        this.saveToHistory();

        this.openPreview(html, css, ts);
        this.isLoading = false;
        this.selectedImage = null;
        this.imagePreview = null;
        this.userInstruction = '';
        this.cdr.detectChanges();

        // Iniciar animación de typing
        this.startTypingAnimation(newMsg);
      },
      error: (err) => {
        console.error(err);
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  private saveToHistory(): void {
    const label = this.messages.find(m => m.role === 'user')?.content?.slice(0, 40) || 'Generación';
    const sessionId = this.selectedHistoryId ?? `session_${Date.now()}`;

    if (this.selectedHistoryId) {
      const existing = this.historyItems.find(h => h.id === this.selectedHistoryId);
      if (existing) { existing.messages = [...this.messages]; }
    } else {
      this.selectedHistoryId = sessionId;
      this.historyItems.unshift({
        id: sessionId,
        label,
        timestamp: new Date(),
        messages: [...this.messages],
      });
    }

    this.saveHistory();
  }

  // ─── Preview ───────────────────────────────────────────────────

  openPreview(html: string, css: string, ts: string): void {
    this.previewHtmlContent = html;
    this.previewCssContent  = css;
    this.previewTsContent   = ts;
    this.previewCode = `<style>${css}</style>${html}`;
    this.previewTab  = 'preview';
    this.showPreview = true;

    const blob = new Blob([this.previewCode], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    this.previewIframeSrc = this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  closePreview(): void { this.showPreview = false; }
  closeModal(): void { this.showModal = false; }

  copyToClipboard(text: string): void { navigator.clipboard.writeText(text); }

  getLineCount(code: string): number { return code ? code.split('\n').length : 0; }

  copyCode(): void {
    const textToCopy =
      this.previewTab === 'html' ? this.previewHtmlContent :
      this.previewTab === 'css'  ? this.previewCssContent  :
      this.previewTab === 'ts'   ? this.previewTsContent   :
      this.previewCode;

    navigator.clipboard.writeText(textToCopy).then(() => {
      this.copySuccess = true;
      setTimeout(() => this.copySuccess = false, 2000);
    });
  }

  openInNewTab(): void {
    const win = window.open('', '_blank');
    if (win) { win.document.write(this.previewCode); win.document.close(); }
  }
}