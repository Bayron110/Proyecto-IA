import { Injectable } from '@angular/core';
import { Database, onValue, push, ref } from 'firebase/database';

@Injectable({
  providedIn: 'root',
})
export class Firebase {
  
    constructor(private db: Database) {}

  guardarUsuario(usuario: any) {
    const usuariosRef = ref(this.db, 'usuarios');
    return push(usuariosRef, usuario);
  }

  obtenerUsuarios(callback: (data: any[]) => void) {
    const usuariosRef = ref(this.db, 'usuarios');
    onValue(usuariosRef, (snapshot) => {
      const data = snapshot.val();
      callback(data ? Object.values(data) : []);
    });
  }
}
