import { Routes } from '@angular/router';

/**
 * Rutas públicas actuales:
 *  - ''      -> Home / Landing pública
 *  - 'login' -> Página de inicio de sesión (esqueleto por ahora)
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./features/home/pages/home/home').then((m) => m.Home),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/autenticacion-seguridad/auth/pages/login/login').then(
        (m) => m.Login,
      ),
  },
  { path: '**', redirectTo: '' },
];
