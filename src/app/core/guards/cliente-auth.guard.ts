import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';

import { AuthService } from '../../features/autenticacion-seguridad/auth/services/auth.service';

/**
 * Guard del área privada del CLIENTE (/carritos/**).
 *
 * - Cliente autenticado: permite el acceso.
 * - Personal autenticado: redirige a /dashboard (el backend además lo rechaza
 *   con 403: el carrito es del cliente).
 * - Sin sesión: redirige a /login conservando la URL actual como `returnUrl`.
 * - Con JWT pero sesión aún no restaurada: restaura antes de decidir.
 *
 * Es protección de frontend/UX: la autorización real la aplica el backend.
 */
export const clienteAuthGuard: CanActivateFn = (
  _route,
  state,
): boolean | UrlTree | Observable<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const aLogin = (): UrlTree =>
    router.createUrlTree(['/login'], {
      queryParams: { returnUrl: state.url },
    });

  const decidir = (): boolean | UrlTree => {
    if (authService.contexto() === 'cliente') {
      return true;
    }
    if (authService.contexto() === 'personal') {
      return router.parseUrl('/dashboard');
    }
    return aLogin();
  };

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
