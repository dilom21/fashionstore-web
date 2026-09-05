import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';

import { AuthService } from '../../features/autenticacion-seguridad/auth/services/auth.service';

/**
 * Guard del área administrativa (/admin/**), exclusiva de ADMINISTRADOR.
 *
 * - Personal con rol ADMINISTRADOR: permite el acceso.
 * - Personal con otro rol: redirige a /dashboard.
 * - Cliente autenticado: redirige a "/".
 * - Sin sesión: redirige a /auth/personal/login.
 * - Con JWT pero sesión aún no restaurada: restaura antes de decidir.
 *
 * Es protección de frontend/UX: el backend exige rol ADMINISTRADOR en cada
 * endpoint (401/403) y sigue siendo la autorización real.
 */
export const adminAuthGuard: CanActivateFn = ():
  | boolean
  | UrlTree
  | Observable<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const usuario = authService.usuarioActual();
  if (usuario !== null) {
    if (usuario.contexto === 'personal') {
      return authService.esAdministrador()
        ? true
        : router.parseUrl('/dashboard');
    }
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
      const actual = authService.usuarioActual();
      if (actual === null) {
        return router.parseUrl('/auth/personal/login');
      }
      if (actual.contexto === 'cliente') {
        return router.parseUrl('/');
      }
      return authService.esAdministrador()
        ? true
        : router.parseUrl('/dashboard');
    }),
    catchError(() => of(router.parseUrl('/auth/personal/login'))),
  );
}
