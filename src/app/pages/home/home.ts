import { ChangeDetectorRef, Component, SecurityContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.html',
  styleUrls: ['./home.css'],
})
export class Home {

  selectedImage: File | null = null;
  imagePreview: string | ArrayBuffer | null = null;

  messages: { role: 'user' | 'bot', content: string }[] = [];

  isLoading = false;
  showModal = false;
  copySuccess = false;

  freeCredits = 3;
  usedCredits = 0;

  // Panel de previsualización
  showPreview = false;
  previewCode = '';
  previewIframeSrc: SafeResourceUrl | null = null;
  previewTab: 'code' | 'preview' = 'code';

  constructor(private sanitizer: DomSanitizer, private cdr: ChangeDetectorRef) {}

  get creditsLeft(): number {
    return this.freeCredits - this.usedCredits;
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
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
  this.cdr.detectChanges(); // forzar vista

  setTimeout(() => {
    this.usedCredits++;
    const generatedHTML = this.generateSimulatedHTML(this.usedCredits);

    this.messages.push({ role: 'bot', content: generatedHTML });
    this.openPreview(generatedHTML);

    this.isLoading = false;

    // forzar actualización de vistas
    this.cdr.detectChanges();

    if (this.usedCredits >= this.freeCredits) {
      this.showModal = true;
      this.cdr.detectChanges();
    }
  }, 800);
}

  openPreview(code: string): void {
    this.previewCode = code;
    // Convertir HTML a blob URL para el iframe (evita problemas de sanitización)
    const blob = new Blob([code], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);
    this.previewIframeSrc = this.sanitizer.bypassSecurityTrustResourceUrl(blobUrl);
    this.showPreview = true;
    this.previewTab = 'code';
  }

  removeImage(): void {
    this.selectedImage = null;
    this.imagePreview = null;
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
    navigator.clipboard.writeText(this.previewCode).then(() => {
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

  // Simula diferentes resultados según el intento
  private generateSimulatedHTML(attempt: number): string {
    const variants = [
      `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Landing Page</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', sans-serif; background: #0f172a; color: #f1f5f9; }
    header { background: #1e293b; padding: 20px 40px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; }
    header h1 { font-size: 22px; font-weight: 700; color: #6366f1; }
    nav a { color: #94a3b8; text-decoration: none; margin-left: 20px; font-size: 14px; }
    .hero { text-align: center; padding: 100px 40px; }
    .hero h2 { font-size: 52px; font-weight: 800; background: linear-gradient(135deg, #6366f1, #a855f7); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 20px; }
    .hero p { font-size: 18px; color: #94a3b8; max-width: 560px; margin: 0 auto 40px; }
    .btn { display: inline-block; background: linear-gradient(135deg, #6366f1, #a855f7); color: white; padding: 14px 32px; border-radius: 50px; text-decoration: none; font-weight: 600; font-size: 15px; }
    .features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; padding: 60px 80px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 28px; }
    .card h3 { font-size: 18px; margin-bottom: 10px; color: #e2e8f0; }
    .card p { color: #64748b; font-size: 14px; line-height: 1.6; }
    .icon { font-size: 28px; margin-bottom: 14px; }
  </style>
</head>
<body>
  <header>
    <h1>⚡ BrandName</h1>
    <nav>
      <a href="#">Inicio</a>
      <a href="#">Producto</a>
      <a href="#">Precios</a>
      <a href="#">Contacto</a>
    </nav>
  </header>
  <section class="hero">
    <h2>Transforma tu visión<br>en realidad</h2>
    <p>Descripción del producto generada automáticamente desde tu diseño.</p>
    <a href="#" class="btn">Comenzar ahora →</a>
  </section>
  <section class="features">
    <div class="card"><div class="icon">🚀</div><h3>Rápido</h3><p>Rendimiento optimizado para la mejor experiencia de usuario.</p></div>
    <div class="card"><div class="icon">🎨</div><h3>Personalizable</h3><p>Adapta cada componente a la identidad de tu marca.</p></div>
    <div class="card"><div class="icon">🔒</div><h3>Seguro</h3><p>Cifrado de extremo a extremo y protección de datos avanzada.</p></div>
  </section>
</body>
</html>`,

      `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Dashboard UI</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; background: #f8fafc; color: #1e293b; display: flex; min-height: 100vh; }
    aside { width: 240px; background: white; border-right: 1px solid #e2e8f0; padding: 24px; }
    aside .logo { font-size: 18px; font-weight: 800; color: #6366f1; margin-bottom: 32px; }
    aside nav a { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 10px; text-decoration: none; color: #475569; font-size: 14px; margin-bottom: 4px; transition: background 0.2s; }
    aside nav a:hover, aside nav a.active { background: #ede9fe; color: #6366f1; }
    main { flex: 1; padding: 32px; }
    .topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px; }
    .topbar h2 { font-size: 22px; font-weight: 700; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 32px; }
    .stat { background: white; border-radius: 14px; padding: 22px; border: 1px solid #e2e8f0; }
    .stat .label { font-size: 13px; color: #94a3b8; margin-bottom: 6px; }
    .stat .value { font-size: 28px; font-weight: 700; color: #1e293b; }
    .stat .change { font-size: 12px; color: #22c55e; margin-top: 4px; }
    .chart-area { background: white; border-radius: 14px; padding: 24px; border: 1px solid #e2e8f0; height: 200px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 14px; }
  </style>
</head>
<body>
  <aside>
    <div class="logo">◈ Metric</div>
    <nav>
      <a href="#" class="active">📊 Dashboard</a>
      <a href="#">📈 Analytics</a>
      <a href="#">👥 Usuarios</a>
      <a href="#">💳 Pagos</a>
      <a href="#">⚙️ Config</a>
    </nav>
  </aside>
  <main>
    <div class="topbar">
      <h2>Resumen general</h2>
      <span style="font-size:13px;color:#94a3b8">Feb 2025</span>
    </div>
    <div class="stats">
      <div class="stat"><div class="label">Usuarios activos</div><div class="value">12,438</div><div class="change">↑ 12.5%</div></div>
      <div class="stat"><div class="label">Ingresos</div><div class="value">$48.2K</div><div class="change">↑ 8.3%</div></div>
      <div class="stat"><div class="label">Conversiones</div><div class="value">3.6%</div><div class="change">↑ 0.4%</div></div>
      <div class="stat"><div class="label">Tickets abiertos</div><div class="value">24</div><div class="change" style="color:#f59e0b">↓ 2</div></div>
    </div>
    <div class="chart-area">📉 Gráfico de actividad mensual</div>
  </main>
</body>
</html>`,

      `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Pricing Page</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Georgia', serif; background: #fffdf7; color: #1c1c1c; }
    header { text-align: center; padding: 60px 20px 20px; }
    header h1 { font-size: 42px; font-weight: 900; letter-spacing: -1px; }
    header p { color: #6b7280; margin-top: 10px; font-size: 16px; }
    .plans { display: flex; justify-content: center; gap: 24px; padding: 50px 40px; flex-wrap: wrap; }
    .plan { background: white; border: 2px solid #e5e7eb; border-radius: 20px; padding: 36px; width: 280px; text-align: center; }
    .plan.popular { border-color: #111; box-shadow: 6px 6px 0 #111; transform: translateY(-8px); }
    .plan h3 { font-size: 18px; font-weight: 700; margin-bottom: 8px; }
    .plan .price { font-size: 42px; font-weight: 900; margin: 16px 0; }
    .plan .price span { font-size: 16px; font-weight: 400; color: #6b7280; }
    .plan ul { list-style: none; margin: 20px 0 28px; text-align: left; }
    .plan ul li { padding: 6px 0; font-size: 14px; color: #374151; border-bottom: 1px dashed #e5e7eb; }
    .plan ul li::before { content: "✓ "; color: #111; font-weight: 700; }
    .plan .btn { display: block; background: #111; color: white; padding: 13px; border-radius: 50px; text-decoration: none; font-weight: 700; font-size: 14px; }
    .plan.popular .btn { background: #6366f1; }
    .badge { display: inline-block; background: #fef3c7; color: #92400e; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; margin-bottom: 12px; }
  </style>
</head>
<body>
  <header>
    <h1>Precios simples,<br>sin sorpresas</h1>
    <p>Elige el plan que mejor se adapte a tus necesidades.</p>
  </header>
  <section class="plans">
    <div class="plan">
      <h3>Starter</h3>
      <div class="price">$0<span>/mes</span></div>
      <ul>
        <li>3 generaciones gratis</li>
        <li>Exportar HTML</li>
        <li>Soporte por email</li>
      </ul>
      <a href="#" class="btn">Comenzar gratis</a>
    </div>
    <div class="plan popular">
      <div class="badge">⭐ MÁS POPULAR</div>
      <h3>Pro</h3>
      <div class="price">$19<span>/mes</span></div>
      <ul>
        <li>Generaciones ilimitadas</li>
        <li>Exportar HTML + CSS</li>
        <li>Historial completo</li>
        <li>Soporte prioritario</li>
      </ul>
      <a href="#" class="btn">Empezar con Pro</a>
    </div>
    <div class="plan">
      <h3>Team</h3>
      <div class="price">$49<span>/mes</span></div>
      <ul>
        <li>Todo en Pro</li>
        <li>Hasta 10 usuarios</li>
        <li>API access</li>
        <li>SLA garantizado</li>
      </ul>
      <a href="#" class="btn">Contactar ventas</a>
    </div>
  </section>
</body>
</html>`
    ];

    return variants[(attempt - 1) % variants.length];
  }

  
}