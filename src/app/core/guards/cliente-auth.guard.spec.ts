import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';

import { AuthService } from '../../features/autenticacion-seguridad/auth/services/auth.service';
import { TenantApiService } from '../../features/saas/services/tenant-api.service';
import { SAAS_MODE } from '../config/app-mode';
import { clienteAuthGuard } from './cliente-auth.guard';

const RUTA = {} as never;
const ESTADO = { url: '/carritos' } as never;

interface Opciones {
  saas: boolean;
  auth: Record<string, unknown>;
  tenant: Record<string, unknown>;
}

function ejecutar(opciones: Opciones): boolean | UrlTree {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: SAAS_MODE, useValue: opciones.saas },
      { provide: AuthService, useValue: opciones.auth },
      { provide: TenantApiService, useValue: opciones.tenant },
    ],
  });
  return TestBed.runInInjectionContext(() =>
    clienteAuthGuard(RUTA, ESTADO),
  ) as boolean | UrlTree;
}

function authLegacy(contexto: 'cliente' | 'personal' | null): Record<string, unknown> {
  return {
    contexto: () => contexto,
    obtenerToken: () => (contexto === null ? null : 'legacy'),
    restaurarSesion: () => undefined,
  };
}

function tenantSesion(params: {
  contexto: 'cliente' | 'personal' | null;
  identidad: boolean;
  token?: boolean;
}): Record<string, unknown> {
  return {
    contexto: () => params.contexto,
    identidad: () => (params.identidad ? { contexto: params.contexto } : null),
    tieneToken: () => params.token ?? false,
    restaurarSesion: () => undefined,
  };
}

describe('clienteAuthGuard', () => {
  it('SaaS: permite con sesión de CLIENTE empresarial', () => {
    const resultado = ejecutar({
      saas: true,
      auth: authLegacy(null),
      tenant: tenantSesion({ contexto: 'cliente', identidad: true }),
    });
    expect(resultado).toBe(true);
  });

  it('SaaS: la sesión de personal empresarial va a la pantalla neutral', () => {
    const resultado = ejecutar({
      saas: true,
      auth: authLegacy(null),
      tenant: tenantSesion({ contexto: 'personal', identidad: true }),
    });
    expect((resultado as UrlTree).toString()).toContain('/saas/sesion');
  });

  it('SaaS: la sesión de personal legacy no entra al carrito del cliente', () => {
    const resultado = ejecutar({
      saas: true,
      auth: authLegacy('personal'),
      tenant: tenantSesion({ contexto: null, identidad: false }),
    });
    expect((resultado as UrlTree).toString()).toContain('/dashboard');
  });

  it('SaaS: sin ninguna sesión redirige a /login conservando returnUrl', () => {
    const resultado = ejecutar({
      saas: true,
      auth: authLegacy(null),
      tenant: tenantSesion({ contexto: null, identidad: false }),
    });
    expect(resultado).toBeInstanceOf(UrlTree);
    expect((resultado as UrlTree).toString()).toContain('/login');
  });

  it('legacy: conserva el acceso del cliente del primer parcial', () => {
    const resultado = ejecutar({
      saas: false,
      auth: authLegacy('cliente'),
      tenant: tenantSesion({ contexto: null, identidad: false }),
    });
    expect(resultado).toBe(true);
  });

  it('legacy: el personal sigue yendo a /dashboard', () => {
    const resultado = ejecutar({
      saas: false,
      auth: authLegacy('personal'),
      tenant: tenantSesion({ contexto: null, identidad: false }),
    });
    expect((resultado as UrlTree).toString()).toContain('/dashboard');
  });

  it('legacy: sin sesión redirige a /login', () => {
    const resultado = ejecutar({
      saas: false,
      auth: authLegacy(null),
      tenant: tenantSesion({ contexto: null, identidad: false }),
    });
    expect(resultado).toBeInstanceOf(UrlTree);
    expect((resultado as UrlTree).toString()).toContain('/login');
  });
});
