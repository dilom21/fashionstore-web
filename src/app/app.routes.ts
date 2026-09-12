import { Routes } from '@angular/router';

import { personalAuthGuard } from './core/guards/personal-auth.guard';

/**
 * Rutas públicas y de autenticación:
 *  - ''                   -> Home / Landing pública
 *  - catalogo             -> Catálogo público de productos (CU09)
 *  - catalogo/productos/:producto_id -> Detalle público de producto (CU09)
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
  // ===== CU09 - Consultar catálogo y disponibilidad (cliente) =====
  {
    path: 'catalogo',
    loadComponent: () =>
      import('./features/catalogo/pages/catalogo-page/catalogo-page').then(
        (m) => m.CatalogoPage,
      ),
  },
  {
    path: 'catalogo/productos/:producto_id',
    loadComponent: () =>
      import(
        './features/catalogo/pages/producto-detalle-page/producto-detalle-page'
      ).then((m) => m.ProductoDetallePage),
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
  {
    path: 'admin',
    loadChildren: () =>
      import('./features/administracion/administracion.routes').then(
        (m) => m.administracionRoutes,
      ),
  },
  { path: '**', redirectTo: '' },
];
