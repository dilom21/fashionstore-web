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
  // CU23 - Comprobante de venta (/personal/ventas/:venta_id/comprobante).
  // Se abre contextualmente desde el resultado exitoso de CU21 (VER
  // COMPROBANTE), tanto en la venta presencial directa (CU20) como en la
  // proveniente de una reserva (CU18 -> CU20): es la MISMA venta y el mismo
  // endpoint. Comparte el layout principal y la protección semántica de
  // ventas. No se relaja `adminAuthGuard`.
  {
    path: 'ventas/:venta_id/comprobante',
    component: AdministracionShell,
    canActivate: [ventasPresencialesGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import(
            './pages/comprobante-personal-page/comprobante-personal-page'
          ).then((m) => m.ComprobantePersonalPage),
      },
    ],
  },
];
