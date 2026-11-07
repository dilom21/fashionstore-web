import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';

import { AuthService } from '../../features/autenticacion-seguridad/auth/services/auth.service';
import { evaluarAccesoPanelEmpresarial } from './sesion-panel-saas';

/**
 * Guard del área de gestión (/admin/**).
 *
 * Da acceso a:
 * - ADMINISTRADOR: todo el panel.
 * - ENCARGADO_SUCURSAL: entra al panel para usar CU13 (Consultar inventario);
 *   el menú se filtra por rol y el resto de pantallas quedan protegidas por el
 *   backend (401/403).
 *
 * Sesión EMPRESARIAL (SaaS, `TenantApiService`):
 * - ADMINISTRADOR de la empresa: entra al panel original (/admin/inicio). La
 *   identidad se confirma con GET /auth/tenant/me; no se exige el token legacy
 *   ni se copia el JWT empresarial a `vanter_access_token`.
 * - ENCARGADO_SUCURSAL / CAJERO de la empresa: a la pantalla neutral de sesión
 *   (/saas/sesion); no reciben acceso administrativo.
 *
 * - Personal con otro rol (p. ej. CAJERO): redirige a /dashboard.
 * - Cliente autenticado: redirige a "/".
 * - Sin sesión: redirige a /auth/personal/login.
 * - Con JWT pero sesión aún no restaurada: restaura antes de decidir.
 *
 * Es protección de frontend/UX: el backend exige el rol en cada endpoint
 * (401/403) y sigue siendo la autorización real.
 */
export const adminAuthGuard: CanActivateFn = ():
  | boolean
  | UrlTree
  | Observable<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // 1) Sesión EMPRESARIAL (SaaS): el panel original reconoce la identidad de
  //    TenantApiService, confirmada con GET /auth/tenant/me. No se exige ni se
  //    crea el token legacy y el JWT empresarial no se copia a la clave legacy.
  const accesoEmpresarial = evaluarAccesoPanelEmpresarial();
  if (accesoEmpresarial !== null) {
    return accesoEmpresarial;
  }

  // 2) Sesión legacy del primer parcial (comportamiento original).
  const usuario = authService.usuarioActual();
  if (usuario !== null) {
    if (usuario.contexto === 'personal') {
      return authService.puedeConsultarInventario()
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
      return authService.puedeConsultarInventario()
        ? true
        : router.parseUrl('/dashboard');
    }),
    catchError(() => of(router.parseUrl('/auth/personal/login'))),
  );
}
