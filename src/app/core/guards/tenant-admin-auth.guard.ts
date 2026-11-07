import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';

import { TenantApiService } from '../../features/saas/services/tenant-api.service';
import {
  LOGIN_PERSONAL_SAAS,
  SESION_SAAS_NEUTRAL,
} from './personal-saas-auth.guard';

/**
 * Guard de las pantallas SaaS exclusivas del ADMINISTRADOR de la empresa
 * (hoy: /saas/empresa, CU04 y CU05).
 *
 * - Identidad empresarial 'personal' con rol ADMINISTRADOR: permite el acceso.
 * - Otro rol empresarial (ENCARGADO_SUCURSAL, CAJERO): a la pantalla neutral
 *   de sesión autenticada; no se inventan accesos.
 * - Contexto 'cliente': vuelve a la tienda (un cliente nunca entra al área del
 *   personal).
 * - Sin sesión empresarial: al login del personal.
 *
 * El rol se toma SIEMPRE de la identidad que devuelve GET /auth/tenant/me, no
 * del rol legacy ni de valores del formulario. El backend sigue siendo la
 * autoridad final (401/403).
 */
export const tenantAdminAuthGuard: CanActivateFn = ():
  | boolean
  | UrlTree
  | Observable<boolean | UrlTree> => {
  const api = inject(TenantApiService);
  const router = inject(Router);

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
    return router.parseUrl(LOGIN_PERSONAL_SAAS);
  }

  return api.restaurarSesion().pipe(
    map(() => decidir()),
    catchError(() => of(router.parseUrl(LOGIN_PERSONAL_SAAS))),
  );
};
