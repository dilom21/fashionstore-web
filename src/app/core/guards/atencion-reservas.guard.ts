import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';

import { AuthService } from '../../features/autenticacion-seguridad/auth/services/auth.service';
import { evaluarAccesoPanelEmpresarial } from './sesion-panel-saas';

/**
 * Guard del área operativa de atención de reservas (CU18 - /personal/**).
 *
 * Actores válidos: ADMINISTRADOR, ENCARGADO_SUCURSAL y CAJERO (misma allowlist
 * que el backend para CU18). El administrador atiende cualquier sucursal; el
 * encargado y el cajero quedan limitados a la suya por el backend.
 *
 * - CLIENTE autenticado: a la tienda.
 * - Otro personal (rol distinto): a /dashboard.
 * - Sin sesión: a /auth/personal/login.
 * - Con JWT pero sesión aún no restaurada (F5): restaura antes de decidir.
 *
 * Es protección de frontend/UX: el backend vuelve a validar rol (403).
 */
export const atencionReservasGuard: CanActivateFn = ():
  | boolean
  | UrlTree
  | Observable<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Sesión EMPRESARIAL (SaaS): el ADMINISTRADOR de la empresa puede recorrer
  // la interfaz original de CU18. Los endpoints legacy siguen bloqueados por el
  // backend (401) mientras el módulo no esté adaptado al multitenant.
  const accesoEmpresarial = evaluarAccesoPanelEmpresarial();
  if (accesoEmpresarial !== null) {
    return accesoEmpresarial;
  }

  const decidir = (): boolean | UrlTree => {
    if (authService.contexto() === 'cliente') {
      return router.parseUrl('/');
    }
    if (authService.puedeAtenderReservas()) {
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
