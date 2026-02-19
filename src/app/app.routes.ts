import { Routes } from '@angular/router';
import { Home } from './pages/home/home';

export const routes: Routes = [
    {path:"Home", component:Home},
    {path: "", redirectTo:"Home", pathMatch:"full"}
];
