import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

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

  // ============================
  // SUBIR IMAGEN
  // ============================
  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Solo se permiten imágenes');
      return;
    }

    this.selectedImage = file;

    const reader = new FileReader();
    reader.onload = () => {
      this.imagePreview = reader.result;
    };
    reader.readAsDataURL(file);
  }

  // ============================
  // ENVIAR (SIMULAR IA)
  // ============================
  sendImage(): void {

    if (!this.selectedImage) return;

    // Mensaje usuario
    this.messages.push({
      role: 'user',
      content: `📎 Imagen enviada: ${this.selectedImage.name}`
    });

    // Simular que la IA piensa
    setTimeout(() => {

      const fakeHTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Landing Page</title>
  <style>
    body {
      margin: 0;
      font-family: Arial, sans-serif;
    }

    header {
      background: #111;
      color: white;
      padding: 20px;
      text-align: center;
    }

    .hero {
      padding: 60px;
      text-align: center;
      background: #f4f4f4;
    }

    .hero h1 {
      font-size: 40px;
    }

    .btn {
      display: inline-block;
      padding: 12px 25px;
      background: #007bff;
      color: white;
      text-decoration: none;
      border-radius: 6px;
    }
  </style>
</head>
<body>

<header>
  <h2>Mi Sitio Web</h2>
</header>

<section class="hero">
  <h1>Título Principal</h1>
  <p>Descripción basada en tu diseño.</p>
  <a href="#" class="btn">Botón CTA</a>
</section>

</body>
</html>
`;

      this.messages.push({
        role: 'bot',
        content: fakeHTML
      });

      // limpiar imagen después de enviar
      this.selectedImage = null;
      this.imagePreview = null;

    }, 1500);
  }

  // ============================
  // ELIMINAR
  // ============================
  removeImage(): void {
    this.selectedImage = null;
    this.imagePreview = null;
  }

}