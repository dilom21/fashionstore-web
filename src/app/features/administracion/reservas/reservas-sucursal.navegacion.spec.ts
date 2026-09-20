import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';

import { routes as appRoutes } from '../../../app.routes';
import { adminAuthGuard } from '../../../core/guards/admin-auth.guard';
import { AuthService } from '../../autenticacion-seguridad/auth/services/auth.service';
import { AdministracionShell } from '../administracion-shell/administracion-shell';
import { administracionRoutes } from '../administracion.routes';
import { ADMIN_NAV_ITEMS } from '../navigation/admin-nav.config';

/** Aplana el menú (padres + hijos) para comparar rutas. */
function rutasDeMenu(items: any[]): string[] {
  const rutas: string[] = [];
  for (const item of items) {
    if (typeof item.route === 'string') {
      rutas.push(item.route);
    }
    if (Array.isArray(item.children) && item.children.length > 0) {
      rutas.push(...rutasDeMenu(item.children));
    }
  }
  return rutas;
}

function ejecutarGuard(auth: any): boolean | UrlTree {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: AuthService, useValue: auth }],
  });
  return TestBed.runInInjectionContext(() =>
    adminAuthGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  ) as boolean | UrlTree;
}

describe('CU17 - navegación, menú y roles (/admin/reservas)', () => {
  const hijos = administracionRoutes[0].children ?? [];
  const rutaReservas = hijos.find((ruta) => ruta.path === 'reservas');

  it('/admin/reservas carga la pantalla real de CU17 (no módulo en construcción)', async () => {
    expect(rutaReservas).toBeDefined();
    const cargador = rutaReservas?.loadComponent as unknown as () => Promise<{
      name?: string;
    }>;
    expect(typeof cargador).toBe('function');

    // loadComponent devuelve directamente la clase del componente (el bundler
    // puede prefijar el nombre, por eso se compara por contenido).
    const pagina = await cargador();
    expect(pagina?.name).toContain('ReservasSucursalPage');
    expect(pagina?.name).not.toContain('ModuloEnConstruccion');
  });

  it('CU13 y CU14 siguen declaradas y el shell exige adminAuthGuard', () => {
    const paths = hijos.map((ruta) => ruta.path);
    expect(paths).toContain('inventario/consultar');
    expect(paths).toContain('inventario/movimientos');
    expect(administracionRoutes[0].canActivate).toContain(adminAuthGuard);
  });

  it('el menú agrupa Reservas con sus dos opciones (CU17 y CU18)', () => {
    const grupo = ADMIN_NAV_ITEMS.find((navItem) => navItem.id === 'reservas');

    // Es un grupo desplegable: sin ruta propia, con hijos.
    expect(grupo?.label).toBe('Reservas');
    expect(grupo?.route).toBeUndefined();
    expect(grupo?.children?.length).toBe(2);

    const gestionar = grupo?.children?.find(
      (hijo) => hijo.id === 'reservas-sucursal',
    );
    expect(gestionar?.label).toBe('Gestionar reservas de sucursal');
    expect(gestionar?.route).toBe('/admin/reservas');
    expect(gestionar?.estado).toBe('funcional');

    const atender = grupo?.children?.find(
      (hijo) => hijo.id === 'reservas-atencion',
    );
    expect(atender?.label).toBe('Atender reservas');
    expect(atender?.route).toBe('/personal/reservas/atencion');
    expect(atender?.estado).toBe('funcional');
  });

  it('el encargado ve Reservas, CU13 y CU14 (y no el resto del panel)', async () => {
    const auth = {
      esAdministrador: () => false,
      esEncargadoSucursal: () => true,
      esCajero: () => false,
      usuarioActual: () => null,
      cerrarSesion: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AdministracionShell],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AdministracionShell);
    const rutas = rutasDeMenu(fixture.componentInstance.navItems());

    expect(rutas).toContain('/admin/reservas');
    expect(rutas).toContain('/personal/reservas/atencion');
    expect(rutas).toContain('/admin/inventario/consultar');
    expect(rutas).toContain('/admin/inventario/movimientos');
    expect(rutas).toContain('/personal/ventas/presencial');
    expect(rutas).not.toContain('/admin/usuarios');
    expect(rutas).not.toContain('/admin/ventas');

    // El grupo Reservas conserva sus dos opciones para su rol.
    const grupoReservas = fixture.componentInstance
      .navItems()
      .find((item) => item.id === 'reservas');
    expect(grupoReservas?.children?.map((hijo) => hijo.label)).toEqual([
      'Gestionar reservas de sucursal',
      'Atender reservas',
    ]);
  });

  it('el CAJERO ve Reservas y Ventas y Pagos (CU18 y CU20), sin módulos administrativos', async () => {
    const auth = {
      esAdministrador: () => false,
      esEncargadoSucursal: () => false,
      esCajero: () => true,
      usuarioActual: () => null,
      cerrarSesion: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AdministracionShell],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AdministracionShell);
    const items = fixture.componentInstance.navItems();

    // Dos grupos operativos: Reservas (CU18) y Ventas y Pagos (CU20).
    expect(items.map((item) => item.id)).toEqual(['reservas', 'ventas']);
    expect(items[0].children?.map((hijo) => hijo.label)).toEqual([
      'Atender reservas',
    ]);
    expect(items[1].children?.map((hijo) => hijo.label)).toEqual([
      'Registrar venta presencial',
    ]);
    expect(rutasDeMenu(items)).toEqual([
      '/personal/reservas/atencion',
      '/personal/ventas/presencial',
    ]);
    expect(rutasDeMenu(items)).not.toContain('/admin/ventas');
  });

  it('CAJERO no puede acceder a CU17 y se le redirige a /dashboard', () => {
    const resultado = ejecutarGuard({
      usuarioActual: () => ({ contexto: 'personal', rol: 'CAJERO' }),
      puedeConsultarInventario: () => false,
      obtenerToken: () => 'jwt',
    });

    expect(resultado instanceof UrlTree).toBe(true);
    expect((resultado as UrlTree).toString()).toBe('/dashboard');
  });

  it('ADMINISTRADOR y ENCARGADO_SUCURSAL sí pueden acceder', () => {
    for (const rol of ['ADMINISTRADOR', 'ENCARGADO_SUCURSAL']) {
      const resultado = ejecutarGuard({
        usuarioActual: () => ({ contexto: 'personal', rol }),
        puedeConsultarInventario: () => true,
        obtenerToken: () => 'jwt',
      });
      expect(resultado).toBe(true);
    }
  });

  it('las rutas del cliente de CU16 siguen intactas (regresión)', () => {
    const paths = appRoutes.map((ruta) => ruta.path);
    expect(paths).toContain('reservas');
    expect(paths).toContain('reservas/:reserva_id');
  });
});
