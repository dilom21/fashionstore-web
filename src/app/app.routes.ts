import { Routes } from '@angular/router';

import { personalAuthGuard } from './core/guards/personal-auth.guard';

/**
 * Rutas públicas y de autenticación:
 *  - ''                   -> Home / Landing pública
 *  - login                -> Login de CLIENTES
 *  - auth                 -> Rutas internas de autenticación-seguridad
 *                            (auth/personal/login -> Login del PERSONAL)
 *  - dashboard            -> Zona del personal (protegida)
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
  {
    path: 'auth',
    loadChildren: () =>
      import(
        './features/autenticacion-seguridad/autenticacion-seguridad.routes'
      ).then((m) => m.autenticacionSeguridadRoutes),
  },
  {
    path: 'dashboard',
    canActivate: [personalAuthGuard],
    loadComponent: () =>
      import(
        './features/autenticacion-seguridad/auth/pages/dashboard/dashboard'
      ).then((m) => m.Dashboard),
  },
  { path: '**', redirectTo: '' },
];
