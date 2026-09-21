import { Routes } from '@angular/router';

import { devolucionesGuard } from '../../core/guards/devoluciones.guard';
import { AdministracionShell } from '../administracion/administracion-shell/administracion-shell';

/**
 * Rutas operativas de CU25 - Registrar devolución de productos.
 *
 * Se montan bajo el prefijo 'personal' en app.routes.ts (junto a CU18 y CU20)
 * porque los actores son ADMINISTRADOR y ENCARGADO_SUCURSAL: usar
 * `adminAuthGuard` bloquearía al encargado.
 *
 *  - /personal/devoluciones                  -> listado y gestión
 *  - /personal/devoluciones/nueva            -> validar venta y registrar
 *  - /personal/devoluciones/:devolucion_id   -> detalle + aprobar/rechazar/procesar
 *
 * Comparten el MISMO layout principal (`AdministracionShell`) que /admin,
 * CU18 y CU20 (sidebar visible) y el guard semántico `devolucionesGuard`
 * (ADMINISTRADOR y ENCARGADO_SUCURSAL; CAJERO y CLIENTE fuera).
 *
 * `devoluciones/nueva` se declara antes de `devoluciones/:devolucion_id`.
 */
export const devolucionesRoutes: Routes = [
  {
    path: 'devoluciones',
    component: AdministracionShell,
    canActivate: [devolucionesGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/devoluciones-page/devoluciones-page').then(
            (m) => m.DevolucionesPage,
          ),
      },
    ],
  },
  {
    path: 'devoluciones/nueva',
    component: AdministracionShell,
    canActivate: [devolucionesGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import(
            './pages/registrar-devolucion-page/registrar-devolucion-page'
          ).then((m) => m.RegistrarDevolucionPage),
      },
    ],
  },
  {
    path: 'devoluciones/:devolucion_id',
    component: AdministracionShell,
    canActivate: [devolucionesGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import(
            './pages/devolucion-detalle-page/devolucion-detalle-page'
          ).then((m) => m.DevolucionDetallePage),
      },
    ],
  },
];
