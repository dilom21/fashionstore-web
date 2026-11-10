import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';

import { TenantApiService } from '../../features/saas/services/tenant-api.service';
import { OfflineIdentityService } from '../../features/saas/offline/offline-identity.service';

function loginFor(context: 'personal' | 'cliente' | null): string {
  return context === 'personal' ? '/auth/personal/login' : '/login';
}

function withIdentity(
  decide: (
    api: TenantApiService,
    router: Router,
    identity: ReturnType<OfflineIdentityService['identityForLocal']>,
  ) => boolean | UrlTree,
): boolean | UrlTree | Observable<boolean | UrlTree> {
  const api = inject(TenantApiService);
  const offlineIdentity = inject(OfflineIdentityService);
  const router = inject(Router);
  const local = offlineIdentity.identityForLocal();
  if (local) return decide(api, router, local);
  if (!api.tieneToken()) return router.parseUrl('/login');
  return api.restaurarSesion().pipe(
    map(() => decide(api, router, offlineIdentity.identityForLocal())),
    catchError(() => {
      const cached = offlineIdentity.identityForLocal();
      const offline =
        typeof navigator !== 'undefined' && navigator.onLine === false;
      return of(
        offline && cached
          ? decide(api, router, cached)
          : router.parseUrl(loginFor(api.contexto())),
      );
    }),
  );
}

/** Rutas locales CU17/CU18: cualquier identidad tenant verificada. */
export const offlineTenantAuthGuard: CanActivateFn = () =>
  withIdentity((_api, router, identity) =>
    identity ? true : router.parseUrl('/login'),
  );

/** CU19: únicamente contexto cliente con rol CLIENTE. */
export const offlineReservaGuard: CanActivateFn = () =>
  withIdentity((_api, router, identity) => {
    return identity?.contexto === 'cliente' &&
      identity.rol.trim().toUpperCase() === 'CLIENTE'
      ? true
      : router.parseUrl('/');
  });

/** CU20: allowlist estricta; no admite encargado, cliente ni superadmin. */
export const offlineVentaGuard: CanActivateFn = () =>
  withIdentity((_api, router, identity) => {
    const role = identity?.rol?.trim().toUpperCase();
    return identity?.contexto === 'personal' &&
      (role === 'CAJERO' || role === 'ADMINISTRADOR')
      ? true
      : router.parseUrl('/saas/sesion');
  });
