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
 * Rutas del panel del primer parcial que YA están adaptadas al modo empresarial
 * y que, por tanto, el ENCARGADO_SUCURSAL puede abrir: CU13 - Consultar
 * inventario y CU14 - Movimientos de inventario (ambas de CU08).
 *
 * Es una lista BLANCA: el resto de `/admin/**` sigue cerrado para su rol. La
 * autorización definitiva la aplica el backend en cada endpoint (403) y RLS.
 */
export const RUTAS_PANEL_ENCARGADO_SAAS: ReadonlySet<string> = new Set([
  '/admin/inventario/consultar',
  '/admin/inventario/movimientos',
]);

/**
 * true si la URL de destino (sin query string ni fragmento) está habilitada
 * para el ENCARGADO_SUCURSAL con sesión empresarial.
 */
export function esRutaHabilitadaEncargado(url: string | undefined): boolean {
  if (url === undefined) {
    return false;
  }
  const ruta = url.split('?')[0].split('#')[0];
  return RUTAS_PANEL_ENCARGADO_SAAS.has(ruta);
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
 * - ENCARGADO_SUCURSAL empresarial: solo las rutas ya adaptadas de CU08
 *   (`RUTAS_PANEL_ENCARGADO_SAAS`); cualquier otra lo devuelve a la pantalla
 *   neutral de sesión.
 * - CAJERO empresarial: a la pantalla neutral de sesión; sus módulos todavía no
 *   están adaptados y no recibe acceso administrativo.
 * - Contexto 'cliente': de vuelta a la tienda.
 * - Sin identidad en memoria pero con JWT empresarial (p. ej. F5): restaura la
 *   sesión con GET /auth/tenant/me antes de decidir.
 *
 * Devuelve `null` cuando NO hay sesión empresarial: en ese caso el guard debe
 * continuar con su lógica del primer parcial (sesión legacy intacta).
 *
 * `url` es la URL que se está activando (`RouterStateSnapshot.url`). Cuando no
 * se informa, el ENCARGADO_SUCURSAL no recibe ninguna ruta del panel.
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
    // ENCARGADO_SUCURSAL: únicamente las pantallas de CU08 ya adaptadas.
    if (api.esEncargadoSucursal() && esRutaHabilitadaEncargado(url)) {
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
