import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { AuthService } from '../../autenticacion-seguridad/auth/services/auth.service';
import { TenantApiService } from '../../saas/services/tenant-api.service';
import { AdministracionShell } from './administracion-shell';

function identidad(rol: string): Record<string, unknown> {
  return {
    usuario_id: 12,
    empresa_id: 3,
    empresa_slug: 'vanter-men',
    empresa_nombre: 'Vanter Men',
    rol,
    contexto: 'personal',
    plan_codigo: 'PRO',
    permite_reportes_ia: false,
    correo: 'admin@vanter.test',
    empleado_id: 7,
    nombre: 'Harold',
    apellido: 'Amador',
    sucursal_id: 2,
  };
}

function tenantMock(rol: string | null): any {
  const persona = rol === null ? null : identidad(rol);
  return {
    identidad: () => persona,
    nombreCompleto: () => (persona === null ? null : 'Harold Amador'),
    rol: () => (persona === null ? null : rol),
    esAdministrador: () => rol === 'ADMINISTRADOR',
    esEncargadoSucursal: () => rol === 'ENCARGADO_SUCURSAL',
    esCajero: () => rol === 'CAJERO',
    tieneToken: () => rol !== null,
    cerrarSesion: vi.fn(),
  };
}

function legacyMock(overrides: Record<string, unknown> = {}): any {
  return {
    usuarioActual: () => null,
    esAdministrador: () => false,
    esEncargadoSucursal: () => false,
    esCajero: () => false,
    cerrarSesion: vi.fn(),
    ...overrides,
  };
}


/**
 * El shell del panel original (`/admin/**`) se conserva tal cual: sidebar,
 * topbar, módulos y filtrado por rol. Ahora puede abrirse con la sesión
 * empresarial (SaaS), que aporta la identidad y la empresa.
 */
describe('AdministracionShell con sesión empresarial', () => {
  let fixture: ComponentFixture<AdministracionShell>;
  let router: Router;
  let tenant: any;
  let legacy: any;

  async function setup(
    rolSesion: string | null,
    legacyOverrides: Record<string, unknown> = {},
  ): Promise<void> {
    tenant = tenantMock(rolSesion);
    legacy = legacyMock(legacyOverrides);

    await TestBed.configureTestingModule({
      imports: [AdministracionShell],
      providers: [
        provideRouter([]),
        { provide: TenantApiService, useValue: tenant },
        { provide: AuthService, useValue: legacy },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(AdministracionShell);
    fixture.detectChanges();
  }

  function texto(): string {
    return ((fixture.nativeElement as HTMLElement).textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function enlaces(): string[] {
    return (
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('a'),
      ) as HTMLAnchorElement[]
    ).map((enlace) => enlace.getAttribute('href') ?? '');
  }

  beforeEach(() => {
    // El shell consulta matchMedia para arrancar colapsado en tablet.
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renderiza el panel con la marca FashionStore y la empresa del contexto', async () => {
    await setup('ADMINISTRADOR');

    expect(texto()).toContain('FASHIONSTORE');
    expect(texto()).toContain('Panel Administrativo');
    expect(texto()).toContain('Harold Amador');
    expect(texto()).toContain('ADMINISTRADOR');
    expect(texto()).toContain('Vanter Men');
    expect(texto()).not.toContain('VANTER MEN');
  });

  it('conserva todos los módulos originales y añade CU4-CU5 al final', async () => {
    await setup('ADMINISTRADOR');

    const etiquetas = fixture.componentInstance
      .navItems()
      .map((item) => item.label);

    expect(etiquetas).toEqual([
      'Inicio',
      'Seguridad',
      'Catálogo',
      'Inventario',
      'Reservas',
      'Ventas y Pagos',
      'Compras y Proveedores',
      'Reportes',
      'CU4-CU5',
    ]);
    expect(enlaces()).toContain('/admin/inicio');
    expect(enlaces()).toContain('/admin/reportes');
    expect(enlaces()).toContain('/saas/empresa');
  });

  it('la opción CU4-CU5 es un enlace visible hacia la pantalla SaaS', async () => {
    await setup('ADMINISTRADOR');

    const enlace = (
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('a'),
      ) as HTMLAnchorElement[]
    ).find((elemento) => elemento.textContent?.includes('CU4-CU5'));

    expect(enlace?.getAttribute('href')).toBe('/saas/empresa');
  });

  it('cerrar sesión limpia la sesión empresarial y vuelve al portero', async () => {
    await setup('ADMINISTRADOR');

    fixture.componentInstance.cerrarSesion();

    expect(tenant.cerrarSesion).toHaveBeenCalledTimes(1);
    expect(legacy.cerrarSesion).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/auth/personal/login');
  });

  it('un CAJERO empresarial no recibe los módulos administrativos', async () => {
    await setup('CAJERO');

    const ids = fixture.componentInstance.navItems().map((item) => item.id);

    expect(ids).toEqual(['reservas', 'ventas']);
    expect(enlaces()).not.toContain('/saas/empresa');
    expect(enlaces()).not.toContain('/admin/usuarios');
  });

  it('la sesión legacy del primer parcial sigue mostrando el panel completo', async () => {
    await setup(null, {
      usuarioActual: () => ({
        id: 1,
        correo: 'admin@vanter.test',
        rol: 'ADMINISTRADOR',
        contexto: 'personal',
        nombre: 'Ana',
        apellido: 'Pérez',
      }),
      esAdministrador: () => true,
    });

    expect(fixture.componentInstance.navItems()).toHaveLength(9);
    expect(texto()).toContain('Ana Pérez');
    // Sin sesión empresarial no se muestra el aviso de módulos no adaptados.
    expect(texto()).not.toContain('Sesión empresarial');
  });
});
