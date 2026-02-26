import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class Ia {

  private apiUrl = 'http://localhost:8000/generate';

  constructor(private http: HttpClient) { }

  generateComponent(file: File, instruction: string): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('instruction', instruction);

    return this.http.post(this.apiUrl, formData);
  }
}
