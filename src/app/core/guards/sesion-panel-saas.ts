import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';

import { TenantApiService } from '../../features/saas/services/tenant-api.service';
import {
  LOGIN_PERSONAL_SAAS,
  SESION_SAAS_NEUTRAL,
} from './personal-saas-auth.guard';

/** Resultado que puede devolver un guard funcional de Angular. */
export type DecisionAcceso = boolean | UrlTree | Observable<boolean | UrlTree>;

/**
 * Rutas del panel que YA están adaptadas al modo empresarial y que el
 * ENCARGADO_SUCURSAL puede abrir:
 *  - CU08: CU13 Consultar inventario y CU14 Movimientos.
 *  - CU28: Dashboard y reportes.
 *  - CU12: Gestión de reservas de sucursal.
 *  - CU12/CU13 operativos: atención de reservas y venta presencial.
 *
 * Es una lista BLANCA: el resto de `/admin/**` sigue cerrado para su rol. La
 * autorización definitiva la aplica el backend en cada endpoint (403) y RLS.
 */
export const RUTAS_PANEL_ENCARGADO_SAAS: ReadonlySet<string> = new Set([
  '/admin/inventario/consultar',
  '/admin/inventario/movimientos',
  '/admin/reportes',
]);

/** Rutas operativas SaaS abiertas a ADMINISTRADOR, ENCARGADO_SUCURSAL y CAJERO. */
export const RUTAS_OPERATIVAS_SAAS: ReadonlySet<string> = new Set([
  '/personal/reservas/atencion',
  '/personal/ventas/presencial',
]);

/** Normaliza una URL a su ruta (sin query string ni fragmento). */
function rutaDeUrl(url: string): string {
  return url.split('?')[0].split('#')[0];
}

/** true si la ruta es la base o una subruta suya. */
function coincideRuta(ruta: string, base: string): boolean {
  return ruta === base || ruta.startsWith(`${base}/`);
}

/**
 * true si la URL de destino está habilitada para el ENCARGADO_SUCURSAL con
 * sesión empresarial.
 */
export function esRutaHabilitadaEncargado(url: string | undefined): boolean {
  if (url === undefined) {
    return false;
  }
  const ruta = rutaDeUrl(url);
  if (RUTAS_PANEL_ENCARGADO_SAAS.has(ruta)) {
    return true;
  }
  if (coincideRuta(ruta, '/admin/reservas')) {
    return true;
  }
  return [...RUTAS_OPERATIVAS_SAAS].some((base) =>
    coincideRuta(ruta, base),
  );
}

/** true si la URL es una ruta operativa que el CAJERO puede abrir en SaaS. */
export function esRutaOperativaCajero(url: string | undefined): boolean {
  if (url === undefined) {
    return false;
  }
  const ruta = rutaDeUrl(url);
  return [...RUTAS_OPERATIVAS_SAAS].some((base) =>
    coincideRuta(ruta, base),
  );
}

/**
 * Resuelve el acceso a las pantallas del PANEL cuando la sesión activa es la
 * EMPRESARIAL (SaaS).
 *
 * Se usa desde los guards del panel del primer parcial (`adminAuthGuard`,
 * `atencionReservasGuard`, `ventasPresencialesGuard`, `devolucionesGuard`)
 * para que reconozcan la sesión de `TenantApiService` sin copiar el JWT
 * empresarial a la clave legacy y sin relajar la autorización:
 *
 * - ADMINISTRADOR empresarial: permite el acceso (el backend sigue siendo la
 *   autoridad final en cada endpoint).
 * - ENCARGADO_SUCURSAL empresarial: CU08, CU12 (gestión/atención), CU13 y CU28.
 * - CAJERO empresarial: únicamente las rutas operativas de CU12 atención y CU13.
 * - Contexto 'cliente': de vuelta a la tienda.
 * - Sin identidad en memoria pero con JWT empresarial (p. ej. F5): restaura la
 *   sesión con GET /auth/tenant/me antes de decidir.
 *
 * Devuelve `null` cuando NO hay sesión empresarial: en ese caso el guard debe
 * continuar con su lógica del primer parcial (sesión legacy intacta).
 *
 * `url` es la URL que se está activando (`RouterStateSnapshot.url`). Cuando no
 * se informa, el ENCARGADO_SUCURSAL/CAJERO no reciben ninguna ruta del panel.
 */
export function decidirAccesoPanelEmpresarial(
  api: TenantApiService,
  router: Router,
  url?: string,
): DecisionAcceso | null {
  const decidir = (): boolean | UrlTree => {
    const identidad = api.identidad();
    if (identidad === null) {
      return router.parseUrl(LOGIN_PERSONAL_SAAS);
    }
    if (identidad.contexto !== 'personal') {
      return router.parseUrl('/');
    }
    if (api.esAdministrador()) {
      return true;
    }
    // ENCARGADO_SUCURSAL: pantallas ya adaptadas (CU08, CU12, CU13, CU28).
    if (api.esEncargadoSucursal() && esRutaHabilitadaEncargado(url)) {
      return true;
    }
    // CAJERO: solo las operativas de CU12 atención y CU13.
    if (api.esCajero() && esRutaOperativaCajero(url)) {
      return true;
    }
    return router.parseUrl(SESION_SAAS_NEUTRAL);
  };

  if (api.identidad() !== null) {
    return decidir();
  }

  if (!api.tieneToken()) {
    return null;
  }

  return api.restaurarSesion().pipe(
    map(() => decidir()),
    catchError(() => of(router.parseUrl(LOGIN_PERSONAL_SAAS))),
  );
}

/** Inyecta lo necesario y evalúa la sesión empresarial del panel. */
export function evaluarAccesoPanelEmpresarial(url?: string): DecisionAcceso | null {
  return decidirAccesoPanelEmpresarial(
    inject(TenantApiService),
    inject(Router),
    url,
  );
}
