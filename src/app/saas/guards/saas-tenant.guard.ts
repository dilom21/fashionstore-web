import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';

import { SAAS_RUTA_LOGIN } from '../saas.config';
import { SaasSessionService } from '../services/saas-session.service';

/**
 * Guard de las rutas privadas del modo SaaS.
 *
 * - Sin token tenant → `/saas/login`.
 * - Con token y sesión en memoria → permite.
 * - Con token y sin sesión (recarga, F5) → hidrata con `GET /auth/tenant/me`.
 * - Si la hidratación falla → cierra la sesión y vuelve a `/saas/login`.
 *
 * Es protección de frontend: el backend siempre revalida el JWT y la vigencia
 * de la membresía (401/403).
 */
export const saasTenantGuard: CanActivateFn = ():
  | boolean
  | UrlTree
  | Observable<boolean | UrlTree> => {
  const sesion = inject(SaasSessionService);
  const router = inject(Router);

  if (!sesion.hayToken()) {
    return router.parseUrl(SAAS_RUTA_LOGIN);
  }

  if (sesion.sesion() !== null) {
    return true;
  }

  return sesion.hidratar().pipe(
    map((hidratada) =>
      hidratada ? true : router.parseUrl(SAAS_RUTA_LOGIN),
    ),
    catchError(() => {
      // Backend caído o respuesta inválida: no se conserva una sesión a medias.
      sesion.cerrarSesion();
      return of(router.parseUrl(SAAS_RUTA_LOGIN));
    }),
  );
};
