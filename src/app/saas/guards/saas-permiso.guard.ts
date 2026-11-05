import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';

import { SAAS_PREFIJO, SAAS_RUTA_LOGIN } from '../saas.config';
import { SaasPermissionsService } from '../services/saas-permissions.service';
import { SaasSessionService } from '../services/saas-session.service';

/** Destino cuando el rol no puede ejecutar la acción. */
export const SAAS_RUTA_SIN_PERMISO = `${SAAS_PREFIJO}/sin-permiso`;

/**
 * Factory de guard por permiso función/acción.
 *
 * Si la matriz aún no está cargada, la pide antes de decidir. La decisión final
 * siempre la toma el backend: esto solo evita mostrar pantallas que el rol no
 * puede usar.
 *
 * @example
 * { path: 'roles-permisos', canActivate: [requierePermiso('PERSONAL', 'CONSULTAR')] }
 */
export function requierePermiso(funcion: string, accion: string): CanActivateFn {
  return (): boolean | UrlTree | Observable<boolean | UrlTree> => {
    const permisos = inject(SaasPermissionsService);
    const sesion = inject(SaasSessionService);
    const router = inject(Router);

    const decidir = (): boolean | UrlTree =>
      permisos.puede(funcion, accion)
        ? true
        : router.parseUrl(SAAS_RUTA_SIN_PERMISO);

    if (permisos.cargado()) {
      return decidir();
    }

    // Sin sesión no tiene sentido pedir la matriz (el guard de tenant decide).
    if (!sesion.hayToken()) {
      return router.parseUrl(SAAS_RUTA_LOGIN);
    }

    return permisos.cargar().pipe(
      map(() => decidir()),
      // Si la matriz no se puede cargar, `puede()` solo deja pasar al
      // ADMINISTRADOR; el resto se trata como sin permiso.
      catchError(() => of(decidir())),
    );
  };
}
