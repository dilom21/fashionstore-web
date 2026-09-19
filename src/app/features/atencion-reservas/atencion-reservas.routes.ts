import { Routes } from '@angular/router';

import { atencionReservasGuard } from '../../core/guards/atencion-reservas.guard';
import { AdministracionShell } from '../administracion/administracion-shell/administracion-shell';

/**
 * Rutas del área de atención de reservas (CU18).
 *
 * Se montan bajo el prefijo 'personal' en app.routes.ts:
 *  - /personal/reservas/atencion                -> reservas por atender
 *  - /personal/reservas/atencion/:reserva_id    -> atender una reserva
 *
 * Comparten el MISMO layout principal del sistema (`AdministracionShell`: barra
 * lateral + topbar) que /admin, de modo que el sidebar sigue visible en el
 * listado y en el detalle. No se relaja `adminAuthGuard`: el acceso a CU18 lo
 * controla `atencionReservasGuard` (ADMINISTRADOR, ENCARGADO_SUCURSAL y CAJERO;
 * CLIENTE queda fuera) y la barra lateral se filtra por rol en el propio shell.
 *
 * `:reserva_id` se declara DESPUÉS de la ruta vacía para que la lista no se
 * interprete como un id.
 */
export const atencionReservasRoutes: Routes = [
  {
    path: 'reservas/atencion',
    component: AdministracionShell,
    canActivate: [atencionReservasGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import(
            './pages/reservas-por-atender-page/reservas-por-atender-page'
          ).then((m) => m.ReservasPorAtenderPage),
      },
      {
        path: ':reserva_id',
        loadComponent: () =>
          import('./pages/atender-reserva-page/atender-reserva-page').then(
            (m) => m.AtenderReservaPage,
          ),
      },
    ],
  },
];
