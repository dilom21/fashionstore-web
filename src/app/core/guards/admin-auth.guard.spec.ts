import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { Observable, of } from 'rxjs';

import { AuthService } from '../../features/autenticacion-seguridad/auth/services/auth.service';
import { TenantApiService } from '../../features/saas/services/tenant-api.service';
import { adminAuthGuard } from './admin-auth.guard';

type Guard = typeof adminAuthGuard;

function identidad(
  rol: string,
  contexto: 'personal' | 'cliente' = 'personal',
): Record<string, unknown> {
  return {
    usuario_id: 12,
    empresa_id: 3,
    empresa_slug: 'vanter-men',
    empresa_nombre: 'Vanter Men',
    rol,
    contexto,
    plan_codigo: 'PRO',
    permite_reportes_ia: false,
    correo: 'admin@vanter.test',
    empleado_id: 7,
    nombre: 'Harold',
    apellido: 'Amador',
    sucursal_id: 2,
  };
}

/** Sesión empresarial simulada (GET /auth/tenant/me). */
function tenantMock(overrides: Record<string, unknown> = {}): any {
  return {
    identidad: () => null,
    tieneToken: () => false,
    restaurarSesion: () => of(null),
    esAdministrador: () => false,
    esEncargadoSucursal: () => false,
    esCajero: () => false,
    cerrarSesion: vi.fn(),
    ...overrides,
  };
}

/** Sesión legacy simulada (AuthService del primer parcial). */
function legacyMock(overrides: Record<string, unknown> = {}): any {
  return {
    usuarioActual: () => null,
    contexto: () => null,
    obtenerToken: () => null,
    restaurarSesion: () => of(false),
    esAdministrador: () => false,
    esEncargadoSucursal: () => false,
    esCajero: () => false,
    puedeConsultarInventario: () => false,
    cerrarSesion: vi.fn(),
    ...overrides,
  };
}

function ejecutar(tenant: any, legacy: any = legacyMock()): boolean | UrlTree {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: TenantApiService, useValue: tenant },
      { provide: AuthService, useValue: legacy },
    ],
  });

  const resultado = TestBed.runInInjectionContext(() =>
    (adminAuthGuard as Guard)(
      {} as ActivatedRouteSnapshot,
      {} as RouterStateSnapshot,
    ),
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


/**
 * `/admin/inicio` es la página inicial del panel original, abierta ahora con la
 * sesión empresarial (SaaS). El guard acepta la identidad confirmada por
 * GET /auth/tenant/me sin exigir ni crear el token legacy.
 */
describe('adminAuthGuard (panel original con sesión empresarial)', () => {
  it('el ADMINISTRADOR de la empresa entra al panel', () => {
    const resultado = ejecutar(
      tenantMock({
        identidad: () => identidad('ADMINISTRADOR'),
        esAdministrador: () => true,
      }),
    );

    expect(resultado).toBe(true);
  });

  it('no consulta ni restaura la sesión legacy cuando ya hay sesión SaaS', () => {
    const legacy = legacyMock({
      usuarioActual: vi.fn(() => null),
      obtenerToken: vi.fn(() => null),
      restaurarSesion: vi.fn(() => of(false)),
    });

    const resultado = ejecutar(
      tenantMock({
        identidad: () => identidad('ADMINISTRADOR'),
        esAdministrador: () => true,
      }),
      legacy,
    );

    expect(resultado).toBe(true);
    expect(legacy.obtenerToken).not.toHaveBeenCalled();
    expect(legacy.restaurarSesion).not.toHaveBeenCalled();
  });

  it('ENCARGADO_SUCURSAL y CAJERO no reciben acceso administrativo', () => {
    for (const rol of ['ENCARGADO_SUCURSAL', 'CAJERO']) {
      const resultado = ejecutar(
        tenantMock({
          identidad: () => identidad(rol),
          esEncargadoSucursal: () => rol === 'ENCARGADO_SUCURSAL',
          esCajero: () => rol === 'CAJERO',
        }),
      );

      expect(url(resultado)).toBe('/saas/sesion');
    }
  });

  it('un cliente empresarial vuelve a la tienda', () => {
    const resultado = ejecutar(
      tenantMock({ identidad: () => identidad('CLIENTE', 'cliente') }),
    );

    expect(url(resultado)).toBe('/');
  });

  it('sin ninguna sesión envía al login del personal', () => {
    expect(url(ejecutar(tenantMock()))).toBe('/auth/personal/login');
  });

  it('restaura la sesión con GET /auth/tenant/me tras recargar (F5)', () => {
    let actual: unknown = null;
    let restaurado = false;
    const api = tenantMock({
      identidad: () => actual,
      tieneToken: () => true,
      restaurarSesion: () => {
        restaurado = true;
        actual = identidad('ADMINISTRADOR');
        return of(actual);
      },
      esAdministrador: () => true,
    });

    const resultado = ejecutar(api);

    expect(resultado).toBe(true);
    expect(restaurado).toBe(true);
  });

  it('si la restauración falla (401/403) no abre el panel', () => {
    const api = tenantMock({
      identidad: () => null,
      tieneToken: () => true,
      restaurarSesion: () => of(null),
    });

    expect(url(ejecutar(api))).toBe('/auth/personal/login');
  });

  it('conserva el comportamiento legacy: ADMINISTRADOR de personal entra', () => {
    const legacy = legacyMock({
      usuarioActual: () => ({
        id: 1,
        correo: 'admin@vanter.test',
        rol: 'ADMINISTRADOR',
        contexto: 'personal',
      }),
      obtenerToken: () => 'jwt-legacy',
      puedeConsultarInventario: () => true,
    });

    expect(ejecutar(tenantMock(), legacy)).toBe(true);
  });

  it('conserva el comportamiento legacy: un cliente no entra al panel', () => {
    const legacy = legacyMock({
      usuarioActual: () => ({
        id: 2,
        correo: 'cliente@correo.test',
        rol: 'CLIENTE',
        contexto: 'cliente',
      }),
      obtenerToken: () => 'jwt-legacy',
    });

    expect(url(ejecutar(tenantMock(), legacy))).toBe('/');
  });
});
