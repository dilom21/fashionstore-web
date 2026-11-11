import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { of } from 'rxjs';
import { PlataformaSaasService } from '../../features/plataforma-saas/services/plataforma-saas.service';

/**
 * El backend publicado no tiene login web: solo acepta una clave de operador.
 * Nunca se solicita ni se guarda esa clave en el navegador. Hasta disponer de
 * un BFF/sesión HttpOnly aprobada, todas las rutas globales quedan bloqueadas.
 */
export const plataformaAuthGuard: CanActivateFn = () => {
  const api = inject(PlataformaSaasService);
  const router = inject(Router);
  return api.sesionWebDisponible()
    ? of(true)
    : of(router.createUrlTree(['/plataforma/ingresar']));
};
