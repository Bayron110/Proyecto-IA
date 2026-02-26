import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Auth, createUserWithEmailAndPassword, updateProfile } from '@angular/fire/auth';
import { Router } from '@angular/router';

@Component({
  selector: 'app-registro',
  imports: [FormsModule],
  templateUrl: './registro.html',
  styleUrl: './registro.css',
})
export class Registro {
nombre: string = '';
  email: string = '';
  password: string = '';

  constructor(private auth: Auth, private router: Router) {}

  async registrar() {
    try {
      const userCredential = await createUserWithEmailAndPassword(
        this.auth,
        this.email,
        this.password
      );

      // Guardar nombre del usuario
      await updateProfile(userCredential.user, {
        displayName: this.nombre
      });

      alert('Usuario creado correctamente ✅');
      this.router.navigate(['/Login']);

    } catch (error: any) {
      alert(error.message);
    }
  }
}
