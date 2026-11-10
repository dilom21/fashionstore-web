import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';

import { AuthService } from '../../features/autenticacion-seguridad/auth/services/auth.service';
import { TenantApiService } from '../../features/saas/services/tenant-api.service';
import { SAAS_MODE } from '../config/app-mode';

/**
 * Guard del área privada del CLIENTE (/carritos/**).
 *
 * Reconoce la sesión que corresponde al modo de compilación:
 *
 * - `saasMode=true`: exige una sesión de CLIENTE EMPRESARIAL confirmada por
 *   `GET /auth/tenant/me` (el carrito SaaS usa `/tenant/carritos` y el backend
 *   autoriza con ese JWT). Una sesión de personal no entra; una sesión legacy
 *   tampoco concede acceso al carrito SaaS.
 * - `saasMode=false`: conserva la lógica del primer parcial (JWT legacy).
 *
 * En ambos modos, sin sesión se redirige a /login conservando la URL actual
 * como `returnUrl`, y la autorización real sigue siendo del backend.
 */
export const clienteAuthGuard: CanActivateFn = (
  _route,
  state,
): boolean | UrlTree | Observable<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const tenantApi = inject(TenantApiService);
  const router = inject(Router);
  const saasMode = inject(SAAS_MODE);

  const aLogin = (): UrlTree =>
    router.createUrlTree(['/login'], {
      queryParams: { returnUrl: state.url },
    });

  const decidir = (): boolean | UrlTree => {
    if (saasMode) {
      // Sesión de cliente empresarial (la que usa el carrito SaaS).
      if (tenantApi.contexto() === 'cliente') {
        return true;
      }
      // Personal empresarial: su lugar es la pantalla neutral de sesión.
      if (tenantApi.contexto() === 'personal') {
        return router.parseUrl('/saas/sesion');
      }
      // Personal legacy: no puede operar el carrito de un cliente.
      if (authService.contexto() === 'personal') {
        return router.parseUrl('/dashboard');
      }
      return aLogin();
    }

    // Modo legacy del primer parcial.
    if (authService.contexto() === 'cliente') {
      return true;
    }
    if (authService.contexto() === 'personal') {
      return router.parseUrl('/dashboard');
    }
    return aLogin();
  };

  if (saasMode) {
    if (tenantApi.identidad() !== null || authService.contexto() !== null) {
      return decidir();
    }
    if (tenantApi.tieneToken()) {
      return tenantApi.restaurarSesion().pipe(
        map(() => decidir()),
        catchError(() => of(aLogin())),
      );
    }
    // Sin JWT empresarial: se intenta restaurar la sesión legacy solo para
    // distinguir personal (dashboard) de visitante (login).
    if (authService.obtenerToken() !== null) {
      return authService.restaurarSesion().pipe(
        map(() => decidir()),
        catchError(() => of(aLogin())),
      );
    }
    return aLogin();
  }

  if (authService.contexto() !== null) {
    return decidir();
  }

  if (authService.obtenerToken() === null) {
    return aLogin();
  }

  // Hay JWT pero el usuario aún no está en memoria (restauración pendiente).
  return authService.restaurarSesion().pipe(
    map(() => decidir()),
    catchError(() => of(aLogin())),
  );
};
