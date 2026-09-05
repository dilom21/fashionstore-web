import { inject } from '@angular/core';
import {
  CanActivateFn,
  Router,
  UrlTree,
} from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';

import { AuthService } from '../../features/autenticacion-seguridad/auth/services/auth.service';

/**
 * Guard del área de personal (/dashboard).
 *
 * - Personal autenticado (contexto === 'personal'): permite el acceso.
 * - Cliente autenticado: no permite el acceso y redirige a "/".
 * - Sin sesión: redirige a /auth/personal/login.
 * - Con JWT pero sesión aún no restaurada (p. ej. F5): restaura la sesión
 *   antes de decidir.
 *
 * Es protección de frontend/UX: el backend protegerá sus propios endpoints.
 */
export const personalAuthGuard: CanActivateFn = ():
  | boolean
  | UrlTree
  | Observable<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.contexto() === 'personal') {
    return true;
  }
  if (authService.contexto() === 'cliente') {
    return router.parseUrl('/');
  }

  const token = authService.obtenerToken();
  if (token === null) {
    return router.parseUrl('/auth/personal/login');
  }

  // Hay JWT pero el usuario aún no está en memoria (restauración pendiente).
  return authService.restaurarSesion().pipe(
    map((restaurada) => {
      if (!restaurada) {
        return router.parseUrl('/auth/personal/login');
      }
      return authService.contexto() === 'personal'
        ? true
        : router.parseUrl('/');
    }),
    catchError(() => of(router.parseUrl('/auth/personal/login'))),
  );
}