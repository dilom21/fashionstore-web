import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { Observable, of } from 'rxjs';

import { TenantApiService } from '../../features/saas/services/tenant-api.service';
import { personalSaasAuthGuard } from './personal-saas-auth.guard';
import { tenantAdminAuthGuard } from './tenant-admin-auth.guard';

type GuardSaas = typeof personalSaasAuthGuard;

function identidad(
  rol: string,
  contexto: 'personal' | 'cliente' = 'personal',
): unknown {
  return {
    usuario_id: 1,
    empresa_id: 3,
    empresa_slug: 'vanter-men',
    empresa_nombre: 'Vanter Men',
    rol,
    contexto,
    plan_codigo: 'PRO',
    permite_reportes_ia: false,
  };
}

function apiMock(overrides: Record<string, unknown> = {}): any {
  return {
    identidad: () => null,
    tieneToken: () => false,
    restaurarSesion: () => of(null),
    esAdministrador: () => false,
    esEncargadoSucursal: () => false,
    esCajero: () => false,
    ...overrides,
  };
}

/** Ejecuta un guard funcional y resuelve el Observable síncrono (`of`). */
function ejecutar(guard: GuardSaas, api: any): boolean | UrlTree {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: TenantApiService, useValue: api },
    ],
  });

  const resultado = TestBed.runInInjectionContext(() =>
    guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  ) as boolean | UrlTree | Observable<boolean | UrlTree>;

  if (resultado instanceof Observable) {
    let final: boolean | UrlTree | undefined;
    (resultado as Observable<boolean | UrlTree>).subscribe((valor) => {
      final = valor;
    });
    if (final === undefined) {
      throw new Error('El guard no resolvió de forma síncrona');
    }
    return final;
  }
  return resultado;
}

function url(resultado: boolean | UrlTree): string | null {
  return resultado === true ? null : resultado.toString();
}

describe('personalSaasAuthGuard (sesión SaaS del personal)', () => {
  it('permite el acceso con identidad empresarial de contexto personal', () => {
    const resultado = ejecutar(
      personalSaasAuthGuard,
      apiMock({ identidad: () => identidad('CAJERO') }),
    );
    expect(resultado).toBe(true);
  });

  it('sin sesión empresarial envía al login del personal', () => {
    const resultado = ejecutar(personalSaasAuthGuard, apiMock());
    expect(url(resultado)).toBe('/auth/personal/login');
  });

  it('restaura la sesión con GET /auth/tenant/me cuando hay JWT empresarial', () => {
    let actual: unknown = null;
    let restaurado = false;
    const api = apiMock({
      identidad: () => actual,
      tieneToken: () => true,
      restaurarSesion: () => {
        restaurado = true;
        actual = identidad('ENCARGADO_SUCURSAL');
        return of(actual);
      },
    });

    const resultado = ejecutar(personalSaasAuthGuard, api);
    expect(resultado).toBe(true);
    expect(restaurado).toBe(true);
  });

  it('un JWT inválido (401 -> null) no abre la pantalla', () => {
    const api = apiMock({
      identidad: () => null,
      tieneToken: () => true,
      restaurarSesion: () => of(null),
    });
    const resultado = ejecutar(personalSaasAuthGuard, api);
    expect(url(resultado)).toBe('/auth/personal/login');
  });

  it('una identidad de CLIENTE nunca entra al área del personal', () => {
    const resultado = ejecutar(
      personalSaasAuthGuard,
      apiMock({ identidad: () => identidad('CLIENTE', 'cliente') }),
    );
    expect(url(resultado)).toBe('/');
  });
});

describe('tenantAdminAuthGuard (panel empresarial)', () => {
  it('el ADMINISTRADOR empresarial accede', () => {
    const resultado = ejecutar(
      tenantAdminAuthGuard,
      apiMock({
        identidad: () => identidad('ADMINISTRADOR'),
        esAdministrador: () => true,
      }),
    );
    expect(resultado).toBe(true);
  });

  it('ENCARGADO_SUCURSAL y CAJERO van a la pantalla neutral, no al panel', () => {
    for (const rol of ['ENCARGADO_SUCURSAL', 'CAJERO']) {
      const resultado = ejecutar(
        tenantAdminAuthGuard,
        apiMock({ identidad: () => identidad(rol) }),
      );
      expect(url(resultado)).toBe('/saas/sesion');
    }
  });

  it('sin sesión empresarial envía al login del personal', () => {
    const resultado = ejecutar(tenantAdminAuthGuard, apiMock());
    expect(url(resultado)).toBe('/auth/personal/login');
  });

  it('un cliente empresarial vuelve a la tienda', () => {
    const resultado = ejecutar(
      tenantAdminAuthGuard,
      apiMock({ identidad: () => identidad('CLIENTE', 'cliente') }),
    );
    expect(url(resultado)).toBe('/');
  });

  it('restaura la sesión antes de decidir y respeta el rol real del backend', () => {
    let actual: unknown = null;
    const api = apiMock({
      identidad: () => actual,
      tieneToken: () => true,
      restaurarSesion: () => {
        actual = identidad('CAJERO');
        return of(actual);
      },
    });

    const resultado = ejecutar(tenantAdminAuthGuard, api);
    expect(url(resultado)).toBe('/saas/sesion');
  });
});
