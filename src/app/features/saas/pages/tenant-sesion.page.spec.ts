import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { TenantApiService } from '../services/tenant-api.service';
import { TenantSesionPage } from './tenant-sesion.page';

function identidad(rol: string): unknown {
  return {
    usuario_id: 12,
    empresa_id: 3,
    empresa_slug: 'vanter-men',
    empresa_nombre: 'Vanter Men',
    rol,
    contexto: 'personal',
    plan_codigo: 'PRO',
    permite_reportes_ia: false,
    correo: 'cajero@vanter.test',
    empleado_id: 7,
    nombre: 'Harold',
    apellido: 'Amador',
    sucursal_id: 2,
  };
}

function apiMock(rol: string): any {
  return {
    identidad: () => identidad(rol),
    nombreCompleto: () => 'Harold Amador',
    esAdministrador: () => rol === 'ADMINISTRADOR',
    esEncargadoSucursal: () => rol === 'ENCARGADO_SUCURSAL',
    esCajero: () => rol === 'CAJERO',
    cerrarSesion: vi.fn(),
  };
}

describe('TenantSesionPage (sesión empresarial autenticada)', () => {
  let fixture: ComponentFixture<TenantSesionPage>;
  let router: Router;

  async function setup(rol: string): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [TenantSesionPage],
      providers: [
        provideRouter([]),
        { provide: TenantApiService, useValue: apiMock(rol) },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(TenantSesionPage);
    fixture.detectChanges();
  }

  function texto(): string {
    return ((fixture.nativeElement as HTMLElement).textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  it('muestra la identidad empresarial del empleado autenticado', async () => {
    await setup('CAJERO');

    expect(texto()).toContain('Vanter Men');
    expect(texto()).toContain('CAJERO');
    expect(texto()).toContain('Harold Amador');
    expect(texto()).toContain('cajero@vanter.test');
    expect(texto()).toContain('todavía no están adaptados');
  });

  it('presenta la plataforma como FashionStore sin sustituir la empresa', async () => {
    await setup('CAJERO');

    expect(texto()).toContain('FashionStore');
    expect(texto()).toContain('Vanter Men');
    expect(texto()).toContain('vanter-men');
  });

  it('no ofrece el panel empresarial a roles que no son administradores', async () => {
    await setup('ENCARGADO_SUCURSAL');

    const enlaces = (
      Array.from(
        fixture.nativeElement.querySelectorAll('a'),
      ) as HTMLAnchorElement[]
    ).map((enlace) => enlace.getAttribute('href') ?? '');

    expect(enlaces).not.toContain('/saas/empresa');
    expect(texto()).toContain('encargado de sucursal');
  });

  it('el administrador puede ir al panel empresarial', async () => {
    await setup('ADMINISTRADOR');

    const enlaces = (
      Array.from(
        fixture.nativeElement.querySelectorAll('a'),
      ) as HTMLAnchorElement[]
    ).map((enlace) => enlace.getAttribute('href') ?? '');

    expect(enlaces).toContain('/saas/empresa');
  });

  it('cerrar sesión elimina la identidad empresarial y vuelve al login del personal', async () => {
    await setup('CAJERO');
    const api = TestBed.inject(TenantApiService) as any;

    const botones = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ) as HTMLButtonElement[];
    const boton = botones.find((elemento) =>
      elemento.textContent?.includes('Cerrar sesión'),
    );
    expect(boton).toBeTruthy();

    boton?.click();

    expect(api.cerrarSesion).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/auth/personal/login');
  });
});
