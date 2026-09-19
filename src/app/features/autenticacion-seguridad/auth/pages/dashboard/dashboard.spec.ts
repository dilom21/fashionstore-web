import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../services/auth.service';
import { Dashboard } from './dashboard';

type Rol = 'ADMINISTRADOR' | 'ENCARGADO_SUCURSAL' | 'CAJERO' | 'CLIENTE';

/**
 * CU18: el dashboard de personal es el punto de descubrimiento de
 * "Atender reservas" para ADMINISTRADOR, ENCARGADO_SUCURSAL y CAJERO, sin
 * exponer módulos administrativos a quien no le corresponden.
 */
describe('Dashboard de personal (accesos por rol)', () => {
  let fixture: ComponentFixture<Dashboard>;

  async function setup(rol: Rol): Promise<void> {
    const esAdmin = rol === 'ADMINISTRADOR';
    const esEncargado = rol === 'ENCARGADO_SUCURSAL';
    const esCajero = rol === 'CAJERO';
    const auth = {
      esAdministrador: () => esAdmin,
      esEncargadoSucursal: () => esEncargado,
      esCajero: () => esCajero,
      puedeAtenderReservas: () => esAdmin || esEncargado || esCajero,
      usuarioActual: () => ({
        contexto: 'personal',
        rol,
        correo: 'personal@vanter.test',
      }),
      cerrarSesion: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    }).compileComponents();

    fixture = TestBed.createComponent(Dashboard);
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
        fixture.nativeElement.querySelectorAll('a'),
      ) as HTMLAnchorElement[]
    ).map((enlace) => enlace.getAttribute('href') ?? '');
  }

  it('el ADMINISTRADOR ve usuarios, reservas de sucursal y atender reservas', async () => {
    await setup('ADMINISTRADOR');

    expect(texto()).toContain('Gestionar usuarios');
    expect(texto()).toContain('Reservas de sucursal');
    expect(texto()).toContain('Atender reservas');
    expect(texto()).toContain(
      'Consulta reservas confirmadas y registra la atención del cliente.',
    );
    expect(enlaces()).toContain('/admin/reservas');
    expect(enlaces()).toContain('/personal/reservas/atencion');
  });

  it('el ENCARGADO_SUCURSAL ve reservas de sucursal y atender reservas', async () => {
    await setup('ENCARGADO_SUCURSAL');

    expect(texto()).toContain('Reservas de sucursal');
    expect(texto()).toContain('Atender reservas');
    expect(enlaces()).toContain('/personal/reservas/atencion');
    expect(texto()).not.toContain('Gestionar usuarios');
  });

  it('el CAJERO solo ve atender reservas (nada administrativo)', async () => {
    await setup('CAJERO');

    expect(texto()).toContain('Atender reservas');
    expect(texto()).toContain(
      'Consulta reservas confirmadas y registra la atención del cliente.',
    );
    expect(texto()).not.toContain('Reservas de sucursal');
    expect(texto()).not.toContain('Gestionar usuarios');
    expect(enlaces()).toEqual(['/personal/reservas/atencion']);
  });
});
