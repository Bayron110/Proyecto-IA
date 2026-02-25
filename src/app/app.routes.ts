import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { Login } from './components/login/login';
import { Registro } from './components/registro/registro';

export const routes: Routes = [
    {path:"Home", component:Home},
    {path:"Login", component:Login},
    {path:"Registro", component:Registro},
    {path: "", redirectTo:"Home", pathMatch:"full"}
];
