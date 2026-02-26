import { ChangeDetectorRef, Component, ElementRef, QueryList, ViewChildren } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

interface ChatMessage {
  role: 'user' | 'bot';
  content: string;
  htmlContent: string;
  cssContent: string;
  tsContent: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './home.html',
  styleUrls: ['./home.css'],
})
export class Home {

  selectedImage: File | null = null;
  imagePreview: string | ArrayBuffer | null = null;
  messages: ChatMessage[] = [];
  isLoading = false;
  showModal = false;
  copySuccess = false;
  freeCredits = 3;
  usedCredits = 0;

  showPreview = false;
  previewCode = '';
  previewHtmlContent = '';
  previewCssContent = '';
  previewTsContent = '';
  previewIframeSrc: SafeResourceUrl | null = null;
  previewTab: 'preview' | 'html' | 'css' | 'ts' = 'preview';
  userInstruction = '';

  @ViewChildren('codeBlock') codeBlocks!: QueryList<ElementRef>;

  constructor(
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    private http: HttpClient
  ) {}

  get creditsLeft(): number {
    return this.freeCredits - this.usedCredits;
  }

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

  sendImage(): void {
    if (!this.selectedImage) return;

    if (this.usedCredits >= this.freeCredits) {
      this.showModal = true;
      return;
    }

    if (this.isLoading) return;

    this.isLoading = true;

    const formData = new FormData();
    formData.append('file', this.selectedImage);
    formData.append('instruction', this.userInstruction);

    this.http.post<{ html: string; css: string; ts: string }>('http://localhost:8000/generate', formData)
      .subscribe({
        next: (response) => {
          this.usedCredits++;

          const html = response.html ?? '';
          const css  = response.css  ?? '';
          const ts   = response.ts   ?? '';
          const fullHTML = `<style>${css}</style>${html}`;

          this.messages.push({
            role: 'bot',
            content: fullHTML,
            htmlContent: html,
            cssContent: css,
            tsContent: ts,
          });

          this.activateTypingAnimation();
          this.openPreview(html, css, ts);

          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error(err);
          this.isLoading = false;
        }
      });
  }

  activateTypingAnimation(): void {
    setTimeout(() => {
      const blocks = document.querySelectorAll<HTMLElement>('.code-preview');
      const total = blocks.length;

      blocks.forEach((block, idx) => {
        if (idx >= total - 3) {
          const delay = (idx - (total - 3)) * 250;
          setTimeout(() => {
            block.classList.remove('typing', 'typing-done');
            void block.offsetWidth;
            block.classList.add('typing');
            setTimeout(() => {
              block.classList.remove('typing');
              block.classList.add('typing-done');
            }, 1850);
          }, delay);
        }
      });
    }, 50);
  }

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

    setTimeout(() => {
      document.querySelectorAll<HTMLElement>('.full-code').forEach(el => {
        el.classList.remove('code-reveal');
        void el.offsetWidth;
        el.classList.add('code-reveal');
      });
    }, 50);
  }

  copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text);
  }

  getLineCount(code: string): number {
    return code ? code.split('\n').length : 0;
  }

  removeImage(): void {
    this.selectedImage = null;
    this.imagePreview  = null;
  }

  closePreview(): void {
    this.showPreview = false;
  }

  closeModal(): void {
    this.showModal = false;
  }

  goToLogin(): void {
    window.location.href = '/Login';
  }

  goToRegister(): void {
    window.location.href = '/Registro';
  }

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
    if (win) {
      win.document.write(this.previewCode);
      win.document.close();
    }
  }
}