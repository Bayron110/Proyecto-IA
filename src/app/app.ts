import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Navbar } from "./components/navbar/navbar";
import { Fotter } from "./components/fotter/fotter";

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Navbar, Fotter],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('proyecto-IA');
}
