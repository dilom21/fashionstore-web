import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';

import { AuthService } from '../../features/autenticacion-seguridad/auth/services/auth.service';

/**
 * Guard del área operativa de ventas presenciales (CU20 -
 * /personal/ventas/presencial).
 *
 * Actores válidos: ADMINISTRADOR, ENCARGADO_SUCURSAL y CAJERO (misma allowlist
 * que el backend para CU20). El administrador opera cualquier sucursal; el
 * encargado y el cajero quedan limitados a la suya por el backend.
 *
 * Es un guard SEMÁNTICO propio de CU20: no reutiliza `atencionReservasGuard`
 * aunque los roles coincidan.
 *
 * - CLIENTE autenticado: a la tienda.
 * - Otro personal (rol distinto): a /dashboard.
 * - Sin sesión: a /auth/personal/login.
 * - Con JWT pero sesión aún no restaurada (F5): restaura antes de decidir.
 *
 * Es protección de frontend/UX: el backend vuelve a validar rol (403).
 */
export const ventasPresencialesGuard: CanActivateFn = ():
  | boolean
  | UrlTree
  | Observable<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const decidir = (): boolean | UrlTree => {
    if (authService.contexto() === 'cliente') {
      return router.parseUrl('/');
    }
    if (authService.puedeRegistrarVentasPresenciales()) {
      return true;
    }
    if (authService.contexto() === 'personal') {
      return router.parseUrl('/dashboard');
    }
    return router.parseUrl('/auth/personal/login');
  };

  if (authService.usuarioActual() !== null) {
    return decidir();
  }

  if (authService.obtenerToken() === null) {
    return router.parseUrl('/auth/personal/login');
  }

  return authService.restaurarSesion().pipe(
    map(() => decidir()),
    catchError(() => of(router.parseUrl('/auth/personal/login'))),
  );
};
