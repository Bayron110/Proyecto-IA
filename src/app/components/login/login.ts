import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Auth, signInWithEmailAndPassword } from '@angular/fire/auth';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {

  email: string = '';
  password: string = '';

  constructor(private auth: Auth, private router: Router) {}

  async login() {
    try {
      await signInWithEmailAndPassword(
        this.auth,
        this.email,
        this.password
      );

      alert('Bienvenido ✅');
      this.router.navigate(['/Home']);

    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  }
}