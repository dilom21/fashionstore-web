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
 * - ENCARGADO_SUCURSAL / CAJERO empresarial: a la pantalla neutral de sesión;
 *   sus módulos todavía no están adaptados y no reciben acceso administrativo.
 * - Contexto 'cliente': de vuelta a la tienda.
 * - Sin identidad en memoria pero con JWT empresarial (p. ej. F5): restaura la
 *   sesión con GET /auth/tenant/me antes de decidir.
 *
 * Devuelve `null` cuando NO hay sesión empresarial: en ese caso el guard debe
 * continuar con su lógica del primer parcial (sesión legacy intacta).
 */
export function decidirAccesoPanelEmpresarial(
  api: TenantApiService,
  router: Router,
): DecisionAcceso | null {
  const decidir = (): boolean | UrlTree => {
    const identidad = api.identidad();
    if (identidad === null) {
      return router.parseUrl(LOGIN_PERSONAL_SAAS);
    }
    if (identidad.contexto !== 'personal') {
      return router.parseUrl('/');
    }
    return api.esAdministrador() ? true : router.parseUrl(SESION_SAAS_NEUTRAL);
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
export function evaluarAccesoPanelEmpresarial(): DecisionAcceso | null {
  return decidirAccesoPanelEmpresarial(
    inject(TenantApiService),
    inject(Router),
  );
}
