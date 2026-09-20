import { Routes } from '@angular/router';

import { ventasPresencialesGuard } from '../../core/guards/ventas-presenciales.guard';
import { AdministracionShell } from '../administracion/administracion-shell/administracion-shell';

/**
 * Rutas del área operativa de Ventas (CU20).
 *
 * Se montan bajo el prefijo 'personal' en app.routes.ts (junto a CU18):
 *  - /personal/ventas/presencial -> POS de venta presencial (directa o reserva)
 *
 * Comparten el MISMO layout principal (`AdministracionShell`) que /admin y
 * CU18, de modo que la barra lateral sigue visible. No se relaja
 * `adminAuthGuard`: el acceso lo controla `ventasPresencialesGuard`
 * (ADMINISTRADOR, ENCARGADO_SUCURSAL y CAJERO; CLIENTE queda fuera) y la barra
 * lateral se filtra por rol en el propio shell.
 */
export const ventasRoutes: Routes = [
  {
    path: 'ventas/presencial',
    component: AdministracionShell,
    canActivate: [ventasPresencialesGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/venta-presencial-page/venta-presencial-page').then(
            (m) => m.VentaPresencialPage,
          ),
      },
    ],
  },
];
