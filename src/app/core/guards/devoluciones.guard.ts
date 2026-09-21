import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';

import { AuthService } from '../../features/autenticacion-seguridad/auth/services/auth.service';

/**
 * Guard del área de devoluciones (CU25 - /personal/devoluciones).
 *
 * Actores válidos: ADMINISTRADOR y ENCARGADO_SUCURSAL (misma allowlist que el
 * backend para CU25, que exige el permiso GESTIONAR_DEVOLUCIONES). El CAJERO y
 * el CLIENTE quedan fuera.
 *
 * Es un guard SEMÁNTICO propio de CU25: no reutiliza `ventasPresencialesGuard`
 * (que además permite CAJERO) ni `adminAuthGuard` (que bloquearía al
 * encargado), aunque comparte el mismo patrón.
 *
 * - CLIENTE autenticado: a la tienda.
 * - Otro personal (CAJERO): a /dashboard.
 * - Sin sesión: a /auth/personal/login.
 * - Con JWT pero sesión aún no restaurada (F5): restaura antes de decidir.
 *
 * Es protección de frontend/UX: el backend vuelve a validar rol y sucursal
 * (403) y es la autoridad final.
 */
export const devolucionesGuard: CanActivateFn = ():
  | boolean
  | UrlTree
  | Observable<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const decidir = (): boolean | UrlTree => {
    if (authService.contexto() === 'cliente') {
      return router.parseUrl('/');
    }
    if (authService.puedeGestionarDevoluciones()) {
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
