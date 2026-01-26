import { Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { AuthGuard } from './_guard/auth.guard';
import { HomeComponent } from './home/home.component';
import { RegisterComponent } from './register/register.component';
import { AuthRedirectGuard } from './_guard/auth-redirect.guard';
import { InstallComponent } from './install/install.component';

export const routes: Routes = [
  { path: '', component: HomeComponent, canActivate: [AuthGuard] },
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [AuthRedirectGuard],
  },
  {
    path: 'register',
    component: RegisterComponent,
    canActivate: [AuthRedirectGuard],
  },
  {
    path: 'install',
    component: InstallComponent,
  },
  { path: '**', redirectTo: 'login' },
];
