import { Routes } from '@angular/router';

import { clienteAuthGuard } from './core/guards/cliente-auth.guard';
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
  // ===== CU15 - Carrito de compras (solo CLIENTE autenticado) =====
  {
    path: 'carritos',
    canActivate: [clienteAuthGuard],
    loadComponent: () =>
      import('./features/carrito/pages/carritos-page/carritos-page').then(
        (m) => m.CarritosPage,
      ),
  },
  {
    path: 'carritos/:carrito_id',
    canActivate: [clienteAuthGuard],
    loadComponent: () =>
      import(
        './features/carrito/pages/carrito-detalle-page/carrito-detalle-page'
      ).then((m) => m.CarritoDetallePage),
  },
  // ===== CU16 - Reservas de prendas (solo CLIENTE autenticado) =====
  // `reservas/nueva/:carrito_id` se declara ANTES de `reservas/:reserva_id`
  // para que "nueva" no se interprete como un reserva_id.
  {
    path: 'reservas',
    canActivate: [clienteAuthGuard],
    loadComponent: () =>
      import('./features/reservas/pages/reservas-page/reservas-page').then(
        (m) => m.ReservasPage,
      ),
  },
  {
    path: 'reservas/nueva/:carrito_id',
    canActivate: [clienteAuthGuard],
    loadComponent: () =>
      import(
        './features/reservas/pages/crear-reserva-page/crear-reserva-page'
      ).then((m) => m.CrearReservaPage),
  },
  {
    path: 'reservas/:reserva_id',
    canActivate: [clienteAuthGuard],
    loadComponent: () =>
      import(
        './features/reservas/pages/reserva-detalle-page/reserva-detalle-page'
      ).then((m) => m.ReservaDetallePage),
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
  // ===== CU18 - Atender reserva de prendas (ENCARGADO_SUCURSAL / CAJERO) =====
  {
    path: 'personal',
    loadChildren: () =>
      import('./features/atencion-reservas/atencion-reservas.routes').then(
        (m) => m.atencionReservasRoutes,
      ),
  },
  { path: '**', redirectTo: '' },
];
