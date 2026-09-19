import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';

import { ToastService } from '../../../../../core/services/toast.service';
import { AuthService } from '../../../../autenticacion-seguridad/auth/services/auth.service';
import { SucursalesService } from '../../../inventario/services/sucursales.service';
import {
  ReservaSucursalDetalle,
  ReservaSucursalResumen,
} from '../../models/reserva-sucursal.model';
import { ReservasSucursalService } from '../../services/reservas-sucursal.service';
import { ReservasSucursalPage } from './reservas-sucursal-page';

function resumen(
  reservaId: number,
  estado: ReservaSucursalResumen['estado'] = 'PENDIENTE',
): ReservaSucursalResumen {
  return {
    reserva_id: reservaId,
    carrito_id: 7,
    cliente_id: 3,
    cliente_nombre: 'Ana',
    cliente_apellido: 'Quispe',
    cliente_telefono: null,
    sucursal_id: 2,
    sucursal_nombre: 'Sucursal Centro',
    fecha_reserva: '2026-09-18T11:00:00+00:00',
    fecha_atencion: '2026-09-20T10:00:00',
    estado,
    observacion: null,
    cantidad_lineas: 1,
    cantidad_unidades: 2,
  };
}

function detalle(
  reservaId: number,
  estado: ReservaSucursalDetalle['estado'],
): ReservaSucursalDetalle {
  return {
    ...resumen(reservaId, estado),
    items: [],
    cantidad_total_unidades: 2,
  };
}

describe('ReservasSucursalPage (CU17) - ENCARGADO_SUCURSAL', () => {
  let fixture: ComponentFixture<ReservasSucursalPage>;
  let componente: ReservasSucursalPage;
  let reservasService: any;
  let sucursalesService: any;
  let auth: any;
  let toast: any;

  async function setup(sucursalId: number | null = 2): Promise<void> {
    reservasService = {
      listarReservas: vi.fn(() =>
        of({
          items: [resumen(1, 'PENDIENTE')],
          total: 1,
          limit: 20,
          offset: 0,
        }),
      ),
      contarReservas: vi.fn(() => of(1)),
      obtenerReserva: vi.fn(() => of(detalle(1, 'PENDIENTE'))),
      confirmarReserva: vi.fn(() => of(detalle(1, 'CONFIRMADA'))),
      cancelarReserva: vi.fn(() => of(detalle(1, 'CANCELADA'))),
      esConfirmable: (estado: string) => estado === 'PENDIENTE',
      esCancelable: (estado: string) =>
        ['PENDIENTE', 'CONFIRMADA'].includes(estado),
    };
    sucursalesService = {
      listarSucursalesActivas: vi.fn(() => of([])),
      obtenerSucursal: vi.fn(() => of({ id: 2, nombre: 'Sucursal Centro' })),
    };
    auth = {
      esAdministrador: () => false,
      esEncargadoSucursal: () => true,
      puedeAtenderReservas: () => true,
      sucursalId: () => sucursalId,
      cerrarSesion: vi.fn(),
    };
    toast = { mostrar: vi.fn(), toasts: signal([]), cerrar: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [ReservasSucursalPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ReservasSucursalService, useValue: reservasService },
        { provide: SucursalesService, useValue: sucursalesService },
        { provide: AuthService, useValue: auth },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReservasSucursalPage);
    componente = fixture.componentInstance;
    fixture.detectChanges();
  }

  function html(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  function ultimaLlamadaListar(): any {
    const llamadas = reservasService.listarReservas.mock.calls;
    return llamadas[llamadas.length - 1][0];
  }

  it('no muestra el selector de sucursal y sí su sucursal asignada', async () => {
    await setup(2);

    expect(
      fixture.nativeElement.querySelector(
        'select[formcontrolname="sucursalId"]',
      ),
    ).toBeNull();
    expect(html()).toContain('Gestiona las reservas de tu sucursal.');
    expect(html()).toContain('Sucursal Centro');
    // No se pide el listado de sucursales: no puede cambiar de sucursal.
    expect(sucursalesService.listarSucursalesActivas).not.toHaveBeenCalled();
    expect(sucursalesService.obtenerSucursal).toHaveBeenCalledWith(2);
  });

  it('nunca envía sucursal_id: el alcance lo aplica el backend', async () => {
    await setup(2);
    expect(ultimaLlamadaListar().sucursal_id).toBeUndefined();

    componente.filtrosForm.controls.estado.setValue('PENDIENTE');
    expect(ultimaLlamadaListar().estado).toBe('PENDIENTE');
    expect(ultimaLlamadaListar().sucursal_id).toBeUndefined();
  });

  it('si la sesión no expone sucursal_id no inventa alcance', async () => {
    await setup(null);
    expect(sucursalesService.obtenerSucursal).not.toHaveBeenCalled();
    expect(html()).toContain('Sucursal asignada');
    expect(ultimaLlamadaListar().sucursal_id).toBeUndefined();
  });

  it('para una reserva CONFIRMADA puede pasar a atenderla (CU18)', async () => {
    await setup(2);

    // PENDIENTE: CU18 no aplica todavía (la atiende CU17).
    (fixture.nativeElement.querySelector('tbody tr') as HTMLElement).click();
    fixture.detectChanges();
    expect(html()).not.toContain('Atender reserva');

    componente.cerrarDetalle();
    reservasService.obtenerReserva.mockReturnValue(
      of(detalle(1, 'CONFIRMADA')),
    );
    const router = TestBed.inject(Router);
    const navegar = vi.spyOn(router, 'navigate');

    (fixture.nativeElement.querySelector('tbody tr') as HTMLElement).click();
    fixture.detectChanges();

    const atender = (
      Array.from(
        fixture.nativeElement.querySelectorAll('button'),
      ) as HTMLButtonElement[]
    ).find((boton) => (boton.textContent ?? '').trim() === 'Atender reserva');
    expect(atender).toBeDefined();

    atender?.click();
    fixture.detectChanges();

    expect(navegar).toHaveBeenCalledWith(['/personal/reservas/atencion', 1]);
  });

  it('puede confirmar reservas de su sucursal', async () => {
    await setup(2);
    (fixture.nativeElement.querySelector('tbody tr') as HTMLElement).click();
    fixture.detectChanges();

    const confirmar = (
      Array.from(
        fixture.nativeElement.querySelectorAll('button'),
      ) as HTMLButtonElement[]
    ).find((boton) => (boton.textContent ?? '').trim() === 'Confirmar reserva');
    expect(confirmar).toBeDefined();

    confirmar?.click();
    fixture.detectChanges();

    const dialogo = fixture.nativeElement.querySelector('app-confirm-dialog');
    const aceptar = (
      Array.from(dialogo.querySelectorAll('button')) as HTMLButtonElement[]
    ).find((boton) => (boton.textContent ?? '').trim() === 'Confirmar reserva');
    aceptar?.click();
    fixture.detectChanges();

    expect(reservasService.confirmarReserva).toHaveBeenCalledWith(1);
    expect(componente.detalle()?.estado).toBe('CONFIRMADA');
  });
});
