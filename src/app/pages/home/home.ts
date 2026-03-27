import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Auth, User, onAuthStateChanged, signOut } from '@angular/fire/auth';
import { Database, child, get, ref, set } from '@angular/fire/database';

interface ChatMessage {
  id: string;
  role: 'user' | 'bot';
  content: string;
  htmlContent: string;
  cssContent: string;
  tsContent: string;
  timestamp?: Date | string | null;
  isTyping?: boolean;
  typingStep?: 'html' | 'css' | 'ts' | 'done' | null;
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
export class Home implements OnInit, OnDestroy {
  private auth = inject(Auth);
  private db = inject(Database);

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

  private readonly CHARS_PER_TICK = 10;
  private readonly TICK_MS = 16;
  private currentPreviewObjectUrl: string | null = null;

  @ViewChild('chatMessages') chatMessagesRef!: ElementRef;

  constructor(
    private sanitizer: DomSanitizer,
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
        this.selectedHistoryId.set(null);
      }
    });
  }

  ngOnDestroy(): void {
    this.revokePreviewUrl();
  }

  private async loadHistoryFromDB(uid: string): Promise<void> {
    try {
      const snapshot = await get(child(ref(this.db), `history/${uid}`));

      if (snapshot.exists()) {
        const data = snapshot.val();

        const rawItems: HistoryItem[] = Array.isArray(data)
          ? data
              .filter((val: any) => val)
              .map((val: any, index: number) => ({
                id: val.id || `session_${index}`,
                label: val.label || 'Generación',
                timestamp: val.timestamp ? new Date(val.timestamp) : new Date(),
                messages: (val.messages || []).map((m: any, i: number) => ({
                  id: m.id || `hist_${index}_${i}`,
                  role: m.role || 'user',
                  content: m.content || '',
                  htmlContent: m.htmlContent || '',
                  cssContent: m.cssContent || '',
                  tsContent: m.tsContent || '',
                  timestamp: m.timestamp ? new Date(m.timestamp) : null,
                  isTyping: false,
                  typingStep: 'done',
                  visibleHtml: m.visibleHtml || '',
                  visibleCss: m.visibleCss || '',
                  visibleTs: m.visibleTs || '',
                })),
              }))
          : Object.entries(data).map(([id, val]: [string, any]) => ({
              id,
              label: val.label || 'Generación',
              timestamp: val.timestamp ? new Date(val.timestamp) : new Date(),
              messages: (val.messages || []).map((m: any, i: number) => ({
                id: m.id || `hist_${id}_${i}`,
                role: m.role || 'user',
                content: m.content || '',
                htmlContent: m.htmlContent || '',
                cssContent: m.cssContent || '',
                tsContent: m.tsContent || '',
                timestamp: m.timestamp ? new Date(m.timestamp) : null,
                isTyping: false,
                typingStep: 'done',
                visibleHtml: m.visibleHtml || '',
                visibleCss: m.visibleCss || '',
                visibleTs: m.visibleTs || '',
              })),
            }));

        const items = rawItems.sort(
          (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
        );

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

  private sanitizeMessagesForSave(messages: ChatMessage[]): any[] {
    return messages.map(m => ({
      id: m.id ?? '',
      role: m.role ?? 'user',
      content: m.content ?? '',
      htmlContent: m.htmlContent ?? '',
      cssContent: m.cssContent ?? '',
      tsContent: m.tsContent ?? '',
      timestamp:
        m.timestamp instanceof Date
          ? m.timestamp.toISOString()
          : (m.timestamp ?? null),
      isTyping: m.isTyping ?? false,
      typingStep: m.typingStep ?? null,
      visibleHtml: m.visibleHtml ?? '',
      visibleCss: m.visibleCss ?? '',
      visibleTs: m.visibleTs ?? '',
    }));
  }

  private saveHistoryToDB(): void {
    const user = this.currentUser();
    if (!user) return;

    const cleanHistory = this.historyItems().map(item => ({
      id: item.id,
      label: item.label ?? 'Generación',
      timestamp:
        item.timestamp instanceof Date
          ? item.timestamp.toISOString()
          : new Date(item.timestamp).toISOString(),
      messages: this.sanitizeMessagesForSave(item.messages || []),
    }));

    set(ref(this.db, `history/${user.uid}`), cleanHistory).catch(error => {
      console.error('Error saving history:', error);
    });
  }

  private saveToHistory(): void {
    const safeMessages = this.sanitizeMessagesForSave(this.messages());

    const label =
      this.messages().find(m => m.role === 'user')?.content?.slice(0, 40) ||
      'Generación';

    const sessionId = this.selectedHistoryId() ?? `session_${Date.now()}`;

    if (this.selectedHistoryId()) {
      this.historyItems.update(items =>
        items.map(h =>
          h.id === this.selectedHistoryId()
            ? { ...h, label, timestamp: new Date(), messages: [...safeMessages] }
            : h
        )
      );
    } else {
      this.selectedHistoryId.set(sessionId);
      this.historyItems.update(items => [
        { id: sessionId, label, timestamp: new Date(), messages: [...safeMessages] },
        ...items,
      ]);
    }

    if (this.currentUser()) {
      this.saveHistoryToDB();
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
    this.revokePreviewUrl();
  }

  loadHistoryItem(item: HistoryItem): void {
    this.selectedHistoryId.set(item.id);
    this.messages.set(
      (item.messages || []).map(m => ({
        ...m,
        isTyping: false,
        typingStep: 'done',
        visibleHtml: m.visibleHtml || '',
        visibleCss: m.visibleCss || '',
        visibleTs: m.visibleTs || '',
      }))
    );
    this.showPreview.set(false);
    this.revokePreviewUrl();
  }

  newChat(): void {
    this.messages.set([]);
    this.selectedHistoryId.set(null);
    this.showPreview.set(false);
    this.selectedImage = null;
    this.imagePreview = null;
    this.userInstruction = '';
    this.revokePreviewUrl();
  }

  getBotIndex(msgIndex: number): number {
    return this.messages().slice(0, msgIndex + 1).filter(m => m.role === 'bot').length;
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
    this.messages.set([]);
    this.usedCredits.set(0);
    this.historyItems.set([]);
    this.showPreview.set(false);
    this.selectedHistoryId.set(null);
    this.revokePreviewUrl();
  }

  goToLogin(): void { window.location.href = '/Login'; }
  goToRegister(): void { window.location.href = '/Registro'; }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Solo se permiten imágenes');
      return;
    }

    this.selectedImage = file;
    const reader = new FileReader();
    reader.onload = () => { this.imagePreview = reader.result; };
    reader.readAsDataURL(file);
  }

  removeImage(): void {
    this.selectedImage = null;
    this.imagePreview = null;
  }

  sendImage(): void {
    const instruction = this.userInstruction?.trim() || '';

    if (!this.selectedImage && !instruction) return;
    if (this.creditsLeft() <= 0) { this.showModal.set(true); return; }
    if (this.isLoading()) return;

    this.isLoading.set(true);

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_u`,
      role: 'user',
      content: instruction || `Imagen: ${this.selectedImage?.name}`,
      htmlContent: '', cssContent: '', tsContent: '',
      timestamp: new Date(),
      isTyping: false, typingStep: null,
      visibleHtml: '', visibleCss: '', visibleTs: '',
    };

    this.messages.update(msgs => [...msgs, userMsg]);
    this.scrollToBottom();

    const context = this.messages().map(m => ({
      role: m.role,
      content: m.content ?? '',
      htmlContent: m.htmlContent ?? '',
      cssContent: m.cssContent ?? '',
      tsContent: m.tsContent ?? '',
      timestamp: m.timestamp instanceof Date
        ? m.timestamp.toISOString()
        : (m.timestamp ?? null),
    }));

    const formData = new FormData();
    if (this.selectedImage) formData.append('file', this.selectedImage);
    formData.append('instruction', instruction);
    formData.append('context', JSON.stringify(context));

    this.http.post<{ html: string; css: string; ts: string }>(
      'http://127.0.0.1:8000/generate',
      formData
    ).subscribe({
      next: (response) => {
        this.usedCredits.update(c => c + 1);

        const html = response.html ?? '';
        const css  = response.css  ?? '';
        const ts   = response.ts   ?? '';

        const msgId = `msg_${Date.now()}_b`;
        const newMsg: ChatMessage = {
          id: msgId, role: 'bot',
          content: `<style>${css}</style>${html}`,
          htmlContent: html, cssContent: css, tsContent: ts,
          timestamp: new Date(),
          isTyping: true, typingStep: 'html',
          visibleHtml: '', visibleCss: '', visibleTs: '',
        };

        this.messages.update(msgs => [...msgs, newMsg]);
        this.openPreview(html, css, ts);
        this.isLoading.set(false);
        this.selectedImage = null;
        this.imagePreview = null;
        this.userInstruction = '';
        this.scrollToBottom();
        setTimeout(() => this.saveToHistory(), 100);
        this.startTypingAnimation(newMsg);
      },
      error: (err) => {
        console.error(err);
        this.isLoading.set(false);
      }
    });
  }

  getVisibleCode(msg: ChatMessage, field: 'html' | 'css' | 'ts'): string {
    const live = this.messages().find(m => m.id === msg.id) ?? msg;

    const content =
      field === 'html' ? live.htmlContent :
      field === 'css'  ? live.cssContent  : live.tsContent;

    if (!content) return '';

    const trunc = (s: string) =>
      s.length > 400 ? s.slice(0, 400) + '\n\n... (' + (s.length - 400) + ' chars más)' : s;

    if (!live.isTyping || live.typingStep === 'done') return trunc(content);

    if (live.typingStep === field) {
      return field === 'html' ? (live.visibleHtml ?? '') :
             field === 'css'  ? (live.visibleCss  ?? '') : (live.visibleTs ?? '');
    }

    const order: Array<'html' | 'css' | 'ts'> = ['html', 'css', 'ts'];
    return order.indexOf(field) < order.indexOf(live.typingStep as 'html' | 'css' | 'ts')
      ? trunc(content) : '';
  }

  private updateMsg(target: ChatMessage, patch: Partial<ChatMessage>): void {
    this.messages.update(msgs =>
      msgs.map(m => (m.id === target.id ? { ...m, ...patch } : m))
    );
    Object.assign(target, patch);
  }

  private startTypingAnimation(msg: ChatMessage): void {
    this.animateField(msg, 'html', msg.htmlContent, () => {
      this.animateField(msg, 'css', msg.cssContent, () => {
        this.animateField(msg, 'ts', msg.tsContent, () => {
          this.updateMsg(msg, {
            isTyping: false, typingStep: 'done',
            visibleHtml: msg.visibleHtml ?? '',
            visibleCss:  msg.visibleCss  ?? '',
            visibleTs:   msg.visibleTs   ?? '',
          });
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

    this.updateMsg(msg, { typingStep: field });
    const preview = fullText.length > 400 ? fullText.slice(0, 400) : fullText;
    let idx = 0;

    const tick = () => {
      idx = Math.min(idx + this.CHARS_PER_TICK, preview.length);
      const visible = preview.slice(0, idx);
      const patch: Partial<ChatMessage> =
        field === 'html' ? { visibleHtml: visible } :
        field === 'css'  ? { visibleCss:  visible } : { visibleTs: visible };
      this.updateMsg(msg, patch);
      this.scrollToBottom();
      if (idx < preview.length) setTimeout(tick, this.TICK_MS);
      else setTimeout(onDone, 150);
    };

    tick();
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      try {
        const el = this.chatMessagesRef?.nativeElement;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      } catch {}
    }, 50);
  }

  private revokePreviewUrl(): void {
    if (this.currentPreviewObjectUrl) {
      URL.revokeObjectURL(this.currentPreviewObjectUrl);
      this.currentPreviewObjectUrl = null;
    }
  }

  private sanitizeHtmlForPreview(html: string): string {
    if (!html) return '';
    return html
      .replace(/@if\s*\([^)]+\)\s*\{/g, '')
      .replace(/@else\s*\{/g, '')
      .replace(/@for\s*\([^)]+\)\s*\{/g, '')
      .replace(/^\s*\}\s*$/gm, '')
      .replace(/\[\([^)]+\)\]="[^"]*"/g, '')
      .replace(/\[[^\]]+\]="[^"]*"/g, '')
      .replace(/\([^)]+\)="[^"]*"/g, '')
      .replace(/\{\{[\s\S]*?\}\}/g, '')
      .replace(/<router-outlet(\s[^>]*)?>\s*<\/router-outlet>/gi, '')
      .replace(/<router-outlet(\s[^>]*)?\/?>/gi, '');
  }

  private sanitizeCssForPreview(css: string): string {
    if (!css) return '';
    return css
      .replace(/:host\b/g, '.preview-root')
      .replace(/::ng-deep/g, '');
  }

  // ─── CORRECCIÓN PRINCIPAL ────────────────────────────────────────────────────
  // Antes: detectaba Angular y solo hacía console.warn → botones muertos.
  // Ahora: si viene JS vanilla (backend corregido) → pasa directo sin tocar nada.
  //        si por alguna razón viene Angular → aplica fallback de UI completo.
  private convertTsToExecutableJs(ts: string): string {
    if (!ts) return '';

    let js = ts
      .replace(/```(?:typescript|ts|javascript|js)?/gi, '')
      .replace(/```/g, '')
      .trim();

    if (!js) return '';

    // Si NO es Angular → JS vanilla puro, ejecutar sin modificar
    const looksAngular =
      /@Component|@NgModule|@Injectable|templateUrl|styleUrls|ngOnInit|signal\s*\(|computed\s*\(|inject\s*\(/.test(js);

    if (!looksAngular) {
      return js; // ← vanilla limpio, no tocar nada
    }

    // Fallback: backend mandó Angular a pesar de las instrucciones
    return `
(function () {
  'use strict';

  function init() {

    // Cerrar modales con botones de cierre
    document.querySelectorAll(
      '[data-dismiss], .btn-close, .modal-close, .close-btn, [data-close], .close, [aria-label="Close"]'
    ).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var modal = btn.closest('.modal, [class*="modal"], [id*="modal"], .dialog, .overlay');
        if (modal) {
          modal.style.display = 'none';
          modal.classList.remove('active', 'show', 'open', 'visible');
        }
      });
    });

    // Cerrar modal al hacer clic en el overlay
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (
        t.classList.contains('modal-overlay') ||
        t.classList.contains('overlay') ||
        t.classList.contains('backdrop')
      ) {
        document.querySelectorAll('.modal, [class*="modal"], .overlay, .backdrop').forEach(function (el) {
          el.style.display = 'none';
          el.classList.remove('active', 'show', 'open', 'visible');
        });
      }
    });

    // Cerrar con ESC
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal, [class*="modal"], .overlay, .backdrop, .dialog').forEach(function (el) {
          el.style.display = 'none';
          el.classList.remove('active', 'show', 'open', 'visible');
        });
      }
    });

    // Formularios → abrir modal de éxito
    document.querySelectorAll('form').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var modal = document.querySelector(
          '.modal, [class*="success"], [class*="confirmation"], [id*="modal"], [class*="modal"]'
        );
        if (modal) {
          modal.style.display = 'flex';
          modal.classList.add('active', 'show', 'open');
        }
      });
    });

    // Botones de texto conocido dentro de modales
    var closeWords = ['entendido', 'aceptar', 'ok', 'cerrar', 'close',
                      'dismiss', 'confirmar', 'got it', 'done', 'listo'];
    document.querySelectorAll('button').forEach(function (btn) {
      if (closeWords.includes((btn.textContent || '').trim().toLowerCase())) {
        btn.addEventListener('click', function () {
          var modal = btn.closest('.modal, [class*="modal"], .dialog, [id*="modal"]');
          if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('active', 'show', 'open', 'visible');
          }
        });
      }
    });

    // Botones que abren modales por data-attribute
    document.querySelectorAll('[data-modal], [data-target], [data-open], [data-bs-target]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var id = btn.getAttribute('data-modal') ||
                 btn.getAttribute('data-target') ||
                 btn.getAttribute('data-open') ||
                 btn.getAttribute('data-bs-target');
        if (!id) return;
        var modal = document.querySelector(id) || document.getElementById(id.replace('#', ''));
        if (modal) {
          modal.style.display = 'flex';
          modal.classList.add('active', 'show', 'open');
        }
      });
    });

    // Tabs básicos
    document.querySelectorAll('[role="tab"], .tab-btn, [data-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        var group = tab.closest('[role="tablist"], .tabs, .tab-group, .tab-bar');
        if (group) {
          group.querySelectorAll('[role="tab"], .tab-btn').forEach(function (t) {
            t.classList.remove('active');
            t.setAttribute('aria-selected', 'false');
          });
        }
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        var target = tab.getAttribute('data-tab') || tab.getAttribute('aria-controls');
        if (target) {
          document.querySelectorAll('[role="tabpanel"], .tab-panel').forEach(function (p) {
            p.classList.remove('active');
            p.style.display = 'none';
          });
          var panel = document.getElementById(target.replace('#', ''));
          if (panel) { panel.classList.add('active'); panel.style.display = 'block'; }
        }
      });
    });

    // Toggles / switches
    document.querySelectorAll('input[type="checkbox"]').forEach(function (chk) {
      chk.addEventListener('change', function () {
        var label = chk.closest('label');
        if (label) label.classList.toggle('active', chk.checked);
        var target = chk.getAttribute('data-toggle');
        if (target) {
          var el = document.getElementById(target);
          if (el) el.classList.toggle('hidden', !chk.checked);
        }
      });
    });

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
    `.trim();
  }

  openPreview(html: string, css: string, ts: string): void {
    this.previewHtmlContent.set(html);
    this.previewCssContent.set(css);
    this.previewTsContent.set(ts);

    const safeHtml     = this.sanitizeHtmlForPreview(html);
    const safeCss      = this.sanitizeCssForPreview(css);
    const executableJs = this.convertTsToExecutableJs(ts);

    const fullHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: 100%; min-height: 100%; }
    body { font-family: Arial, sans-serif; overflow-x: hidden; }
    .preview-root { min-height: 100vh; width: 100%; position: relative; }
    ${safeCss}
  </style>
</head>
<body>
  <div class="preview-root">
    ${safeHtml}
  </div>
  <script>
    window.addEventListener('error', function(e) {
      console.error('Preview error:', e.message);
    });
    try {
      ${executableJs}
    } catch(e) {
      console.error('Error ejecutando JS del preview:', e);
    }
  </script>
</body>
</html>`.trim();

    this.previewCode.set(fullHtml);
    this.previewTab.set('preview');
    this.showPreview.set(true);

    this.revokePreviewUrl();
    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    this.currentPreviewObjectUrl = url;
    this.previewIframeSrc.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
  }

  closePreview(): void { this.showPreview.set(false); }
  closeModal(): void   { this.showModal.set(false); }

  copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text);
  }

  getLineCount(code: string): number {
    return code ? code.split('\n').length : 0;
  }

  copyCode(): void {
    const tab  = this.previewTab();
    const text =
      tab === 'html' ? this.previewHtmlContent() :
      tab === 'css'  ? this.previewCssContent()  :
      tab === 'ts'   ? this.previewTsContent()   : this.previewCode();

    navigator.clipboard.writeText(text).then(() => {
      this.copySuccess.set(true);
      setTimeout(() => this.copySuccess.set(false), 2000);
    });
  }

  openInNewTab(): void {
    const win = window.open('', '_blank');
    if (win) {
      win.document.open();
      win.document.write(this.previewCode());
      win.document.close();
    }
  }
}