import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { PlataformaSaasService } from '../../features/plataforma-saas/services/plataforma-saas.service';

/**
 * La autorización real la decide FastAPI mediante la sesión HttpOnly; el guard
 * solo evita renderizar la vista cuando /auth/me devuelve 401/503.
 */
export const plataformaAuthGuard: CanActivateFn = () => {
  const api = inject(PlataformaSaasService);
  const router = inject(Router);
  return api.sesionWebDisponible().pipe(
    map(() => true),
    catchError(() => of(router.createUrlTree(['/plataforma/ingresar']))),
  );
};
