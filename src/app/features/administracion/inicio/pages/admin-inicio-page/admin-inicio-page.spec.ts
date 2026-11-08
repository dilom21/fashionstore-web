import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../../../autenticacion-seguridad/auth/services/auth.service';
import { TenantApiService } from '../../../../saas/services/tenant-api.service';
import { AdminInicioPage } from './admin-inicio-page';

const EMPRESA = {
  usuario_id: 12,
  empresa_id: 3,
  empresa_slug: 'vanter-men',
  empresa_nombre: 'Vanter Men',
  rol: 'ADMINISTRADOR',
  contexto: 'personal',
  plan_codigo: 'PRO',
  permite_reportes_ia: false,
  correo: 'admin@vanter.test',
  empleado_id: 7,
  nombre: 'Harold',
  apellido: 'Amador',
  sucursal_id: 2,
};

function tenantMock(identidad: unknown): any {
  return {
    identidad: () => identidad,
    nombreCompleto: () => (identidad === null ? null : 'Harold Amador'),
    rol: () => (identidad === null ? null : 'ADMINISTRADOR'),
    esAdministrador: () => identidad !== null,
    esEncargadoSucursal: () => false,
    esCajero: () => false,
    tieneToken: () => identidad !== null,
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
 * `/admin/inicio` es la página inicial del administrador: conserva la
 * bienvenida y los accesos del primer parcial, pero la identidad y la empresa se
 * toman de la sesión empresarial (GET /auth/tenant/me).
 */
describe('AdminInicioPage', () => {
  let fixture: ComponentFixture<AdminInicioPage>;

  async function setup(
    identidad: unknown,
    legacyOverrides: Record<string, unknown> = {},
  ): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [AdminInicioPage],
      providers: [
        provideRouter([]),
        { provide: TenantApiService, useValue: tenantMock(identidad) },
        { provide: AuthService, useValue: legacyMock(legacyOverrides) },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminInicioPage);
    fixture.detectChanges();
  }

  function texto(): string {
    return ((fixture.nativeElement as HTMLElement).textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tarjeta(nombre: string): HTMLElement | undefined {
    return (
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll(
          'a.admin-inicio__card',
        ),
      ) as HTMLElement[]
    ).find((elemento) => elemento.textContent?.includes(nombre));
  }

  it('saluda al personal de la identidad empresarial', async () => {
    await setup(EMPRESA);

    expect(texto()).toContain('Bienvenido, Harold Amador');
  });

  it('muestra la empresa del contexto SaaS y la marca FashionStore', async () => {
    await setup(EMPRESA);

    expect(texto()).toContain('Panel administrativo de Vanter Men');
  });

  it('incluye la tarjeta CU4-CU5 enlazada a la pantalla SaaS', async () => {
    await setup(EMPRESA);

    const cu4Cu5 = tarjeta('CU4-CU5');

    expect(cu4Cu5).toBeTruthy();
    expect(cu4Cu5?.getAttribute('href')).toBe('/saas/empresa');
    expect(cu4Cu5?.textContent).toContain('Disponible');
  });

  it('no presenta como disponibles los módulos aún no adaptados', async () => {
    await setup(EMPRESA);

    expect(tarjeta('Gestionar Usuarios')?.textContent).toContain(
      'Pendiente de adaptación',
    );
    expect(tarjeta('Gestionar Usuarios')?.textContent).not.toContain(
      'Disponible',
    );
  });

  it('sin sesión empresarial conserva la bienvenida y los estados legacy', async () => {
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

    expect(texto()).toContain('Bienvenido, Ana Pérez');
    expect(texto()).toContain('Panel administrativo de FashionStore');
    expect(tarjeta('Gestionar Usuarios')?.textContent).toContain('Disponible');
  });
});
