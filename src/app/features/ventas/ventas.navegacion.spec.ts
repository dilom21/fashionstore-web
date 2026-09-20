import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Route,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { of } from 'rxjs';

import { routes as appRoutes } from '../../app.routes';
import { ventasPresencialesGuard } from '../../core/guards/ventas-presenciales.guard';
import { AdministracionShell } from '../administracion/administracion-shell/administracion-shell';
import { ADMIN_NAV_ITEMS } from '../administracion/navigation/admin-nav.config';
import { AuthService } from '../autenticacion-seguridad/auth/services/auth.service';
import { ventasRoutes } from './ventas.routes';

function authMock(overrides: Record<string, unknown> = {}): any {
  return {
    contexto: () => 'personal',
    usuarioActual: () => ({ contexto: 'personal', rol: 'CAJERO' }),
    obtenerToken: () => 'jwt',
    esAdministrador: () => false,
    esEncargadoSucursal: () => false,
    esCajero: () => true,
    puedeRegistrarVentasPresenciales: () => true,
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
    ventasPresencialesGuard(
      {} as ActivatedRouteSnapshot,
      {} as RouterStateSnapshot,
    ),
  ) as boolean | UrlTree;
}

describe('CU20 - navegación, rutas y roles (/personal/ventas/presencial)', () => {
  it('ADMINISTRADOR, ENCARGADO_SUCURSAL y CAJERO acceden', () => {
    expect(ejecutarGuard(authMock())).toBe(true);
    expect(
      ejecutarGuard(
        authMock({
          esAdministrador: () => true,
          esCajero: () => false,
          puedeRegistrarVentasPresenciales: () => true,
        }),
      ),
    ).toBe(true);
    expect(
      ejecutarGuard(
        authMock({
          esEncargadoSucursal: () => true,
          esCajero: () => false,
          puedeRegistrarVentasPresenciales: () => true,
        }),
      ),
    ).toBe(true);
  });

  it('el CLIENTE NO accede: vuelve a la tienda', () => {
    const cliente = authMock({
      contexto: () => 'cliente',
      usuarioActual: () => ({ contexto: 'cliente' }),
      puedeRegistrarVentasPresenciales: () => false,
    });
    expect((ejecutarGuard(cliente) as UrlTree).toString()).toBe('/');
  });

  it('sin sesión se redirige al login de personal', () => {
    const anonimo = authMock({
      contexto: () => null,
      usuarioActual: () => null,
      obtenerToken: () => null,
      puedeRegistrarVentasPresenciales: () => false,
    });
    expect((ejecutarGuard(anonimo) as UrlTree).toString()).toBe(
      '/auth/personal/login',
    );
  });

  it('otro rol de personal va a /dashboard', () => {
    const otro = authMock({
      usuarioActual: () => ({ contexto: 'personal', rol: 'SUPERVISOR' }),
      esCajero: () => false,
      puedeRegistrarVentasPresenciales: () => false,
    });
    expect((ejecutarGuard(otro) as UrlTree).toString()).toBe('/dashboard');
  });

  it('con JWT sin sesión restaurada, restaura antes de decidir', () => {
    let restaurado = false;
    const auth = authMock({
      usuarioActual: () => null,
      obtenerToken: () => 'jwt',
      restaurarSesion: () => {
        restaurado = true;
        return of(true);
      },
    });
    let resultado: boolean | UrlTree | undefined;
    (ejecutarGuard(auth) as any).subscribe(
      (valor: boolean | UrlTree) => (resultado = valor),
    );
    expect(resultado).toBe(true);
    expect(restaurado).toBe(true);
  });

  it('la ruta usa el layout principal, está protegida y carga la página real', async () => {
    const ruta = ventasRoutes[0];
    expect(ruta.path).toBe('ventas/presencial');
    expect(ruta.canActivate).toContain(ventasPresencialesGuard);
    expect(ruta.component).toBe(AdministracionShell);

    const hijos = ruta.children ?? [];
    expect(hijos.map((hijo) => hijo.path)).toEqual(['']);
    const cargador = hijos[0].loadComponent as unknown as () => Promise<{
      name?: string;
    }>;
    const pagina = await cargador();
    expect(pagina?.name).toContain('VentaPresencialPage');
  });

  it('app.routes.ts monta /personal con CU18 y CU20 sin romper el resto', async () => {
    const paths = appRoutes.map((ruta) => ruta.path);
    expect(paths).toContain('personal');
    // CU19 del cliente sigue intacto.
    expect(paths).toContain('checkout/:carrito_id');
    expect(paths).toContain('admin');

    const personal = appRoutes.find((ruta) => ruta.path === 'personal');
    const cargador = personal?.loadChildren as unknown as () => Promise<
      Route[]
    >;
    const rutas = await cargador();
    const rutasHijas = rutas.map((ruta) => ruta.path);
    expect(rutasHijas).toContain('reservas/atencion');
    expect(rutasHijas).toContain('ventas/presencial');
  });

  it('el menú vuelve funcional Ventas y Pagos con la venta presencial', () => {
    const grupo = ADMIN_NAV_ITEMS.find((item) => item.id === 'ventas');
    expect(grupo?.label).toBe('Ventas y Pagos');
    expect(grupo?.route).toBeUndefined();
    expect(grupo?.estado).toBeUndefined();

    const hijo = grupo?.children?.find(
      (item) => item.id === 'venta-presencial',
    );
    expect(hijo?.label).toBe('Registrar venta presencial');
    expect(hijo?.route).toBe('/personal/ventas/presencial');
    expect(hijo?.estado).toBe('funcional');
  });
});
