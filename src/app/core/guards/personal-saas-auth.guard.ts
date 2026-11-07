import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';

import { TenantApiService } from '../../features/saas/services/tenant-api.service';

/** Acceso del portero del personal: se conserva la dirección del primer parcial. */
export const LOGIN_PERSONAL_SAAS = '/auth/personal/login';

/**
 * Pantalla neutral de sesión autenticada, para roles empresariales cuyos
 * módulos operativos todavía no están adaptados a SaaS (ENCARGADO_SUCURSAL,
 * CAJERO). No habilita nada: solo confirma la identidad y permite salir.
 */
export const SESION_SAAS_NEUTRAL = '/saas/sesion';

/**
 * Guard de las pantallas SaaS del PERSONAL.
 *
 * Usa EXCLUSIVAMENTE la sesión empresarial (`TenantApiService`):
 * - Identidad empresarial con contexto 'personal': permite el acceso.
 * - Contexto 'cliente': no entra al área del personal; vuelve a la tienda.
 * - Sin identidad en memoria pero con JWT empresarial (p. ej. F5): restaura
 *   la sesión con GET /auth/tenant/me antes de decidir.
 * - Sin JWT empresarial o restauración fallida: al login del personal.
 *
 * El JWT legacy (AuthService) no participa en esta decisión. Es protección de
 * navegación: la autorización real la aplica el backend (401/403).
 */
export const personalSaasAuthGuard: CanActivateFn = ():
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
    return true;
  };

  if (api.identidad() !== null) {
    return decidir();
  }

  if (!api.tieneToken()) {
    return router.parseUrl(LOGIN_PERSONAL_SAAS);
  }

  // Hay JWT empresarial pero la identidad aún no está en memoria.
  return api.restaurarSesion().pipe(
    map(() => decidir()),
    catchError(() => of(router.parseUrl(LOGIN_PERSONAL_SAAS))),
  );
};
