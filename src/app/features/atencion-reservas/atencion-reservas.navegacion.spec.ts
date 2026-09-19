import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { of } from 'rxjs';

import { routes as appRoutes } from '../../app.routes';
import { atencionReservasGuard } from '../../core/guards/atencion-reservas.guard';
import { AdministracionShell } from '../administracion/administracion-shell/administracion-shell';
import { AuthService } from '../autenticacion-seguridad/auth/services/auth.service';
import { atencionReservasRoutes } from './atencion-reservas.routes';

function authMock(overrides: Record<string, unknown> = {}): any {
  return {
    contexto: () => 'personal',
    usuarioActual: () => ({ contexto: 'personal', rol: 'ENCARGADO_SUCURSAL' }),
    obtenerToken: () => 'jwt',
    esAdministrador: () => false,
    esEncargadoSucursal: () => true,
    esCajero: () => false,
    puedeAtenderReservas: () => true,
    restaurarSesion: () => of(true),
    ...overrides,
  };
}

function ejecutarGuard(auth: any): boolean | UrlTree {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: AuthService, useValue: auth }],
  });
  return TestBed.runInInjectionContext(() =>
    atencionReservasGuard(
      {} as ActivatedRouteSnapshot,
      {} as RouterStateSnapshot,
    ),
  ) as boolean | UrlTree;
}

describe('CU18 - navegación, rutas y roles (/personal/reservas/atencion)', () => {
  it('el ENCARGADO_SUCURSAL puede acceder', () => {
    expect(ejecutarGuard(authMock())).toBe(true);
  });

  it('el CAJERO puede acceder', () => {
    const cajero = authMock({
      usuarioActual: () => ({ contexto: 'personal', rol: 'CAJERO' }),
      esEncargadoSucursal: () => false,
      esCajero: () => true,
    });
    expect(ejecutarGuard(cajero)).toBe(true);
  });

  it('el ADMINISTRADOR también accede (atiende cualquier sucursal)', () => {
    const admin = authMock({
      usuarioActual: () => ({ contexto: 'personal', rol: 'ADMINISTRADOR' }),
      esAdministrador: () => true,
      esEncargadoSucursal: () => false,
      puedeAtenderReservas: () => true,
    });
    expect(ejecutarGuard(admin)).toBe(true);
  });

  it('el CLIENTE NO accede: vuelve a la tienda', () => {
    const cliente = authMock({
      contexto: () => 'cliente',
      usuarioActual: () => ({ contexto: 'cliente' }),
      puedeAtenderReservas: () => false,
    });
    expect((ejecutarGuard(cliente) as UrlTree).toString()).toBe('/');
  });

  it('sin sesión se redirige al login de personal', () => {
    const anonimo = authMock({
      contexto: () => null,
      usuarioActual: () => null,
      obtenerToken: () => null,
      puedeAtenderReservas: () => false,
    });
    expect((ejecutarGuard(anonimo) as UrlTree).toString()).toBe(
      '/auth/personal/login',
    );
  });

  it('otro rol de personal va a /dashboard', () => {
    const otro = authMock({
      usuarioActual: () => ({ contexto: 'personal', rol: 'SUPERVISOR' }),
      esEncargadoSucursal: () => false,
      puedeAtenderReservas: () => false,
    });
    expect((ejecutarGuard(otro) as UrlTree).toString()).toBe('/dashboard');
  });

  it('las rutas de CU18 usan el layout principal, están protegidas y cargan las páginas reales', async () => {
    const ruta = atencionReservasRoutes[0];
    expect(ruta.path).toBe('reservas/atencion');
    expect(ruta.canActivate).toContain(atencionReservasGuard);
    // Mismo layout/sidebar que /admin (ya no hay shell propio de CU18).
    expect(ruta.component).toBe(AdministracionShell);

    const hijos = ruta.children ?? [];
    expect(hijos.map((hijo) => hijo.path)).toEqual(['', ':reserva_id']);

    // `:reserva_id` va después de la lista para no interpretarla como un id.
    expect(hijos[0].loadComponent).toBeDefined();
    const cargadorLista = hijos[0].loadComponent as unknown as () => Promise<{
      name?: string;
    }>;
    const paginaLista = await cargadorLista();
    expect(paginaLista?.name).toContain('ReservasPorAtenderPage');

    const cargadorDetalle = hijos[1].loadComponent as unknown as () => Promise<{
      name?: string;
    }>;
    const paginaDetalle = await cargadorDetalle();
    expect(paginaDetalle?.name).toContain('AtenderReservaPage');
  });

  it('app.routes.ts monta /personal y conserva CU16/CU17', () => {
    const paths = appRoutes.map((ruta) => ruta.path);
    expect(paths).toContain('personal');
    // CU16 del cliente sigue intacto.
    expect(paths).toContain('reservas');
    expect(paths).toContain('reservas/:reserva_id');
    // CU17 sigue montado en /admin.
    expect(paths).toContain('admin');
  });
});
