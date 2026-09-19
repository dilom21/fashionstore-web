import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { ToastService } from '../../../../core/services/toast.service';
import { ReservaResumen } from '../../models/reserva.model';
import { ReservasService } from '../../services/reservas.service';
import { ReservasPage } from './reservas-page';

function resumen(
  reservaId: number,
  estado: ReservaResumen['estado'],
): ReservaResumen {
  return {
    reserva_id: reservaId,
    carrito_id: 7,
    cliente_id: 3,
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

function crearMockReservas(lista: ReservaResumen[]) {
  return {
    listarReservas: vi.fn(() =>
      of({ items: lista, total_reservas: lista.length }),
    ),
    cancelarReserva: vi.fn(() => of({ ...resumen(1, 'CANCELADA') })),
    obtenerReserva: vi.fn(),
    crearReserva: vi.fn(),
    esCancelable: (estado: string) =>
      ['PENDIENTE', 'CONFIRMADA'].includes((estado ?? '').trim().toUpperCase()),
  };
}

describe('ReservasPage (CU16)', () => {
  let fixture: ComponentFixture<ReservasPage>;
  let componente: ReservasPage;
  let reservasService: ReturnType<typeof crearMockReservas>;
  let toast: any;

  async function setup(lista: ReservaResumen[]) {
    reservasService = crearMockReservas(lista);
    toast = { mostrar: vi.fn(), toasts: signal([]), cerrar: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [ReservasPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ReservasService, useValue: reservasService },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReservasPage);
    componente = fixture.componentInstance;
    fixture.detectChanges();
  }

  function botonesCancelar(): HTMLButtonElement[] {
    const botones = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ) as HTMLButtonElement[];
    return botones.filter(
      (boton) => (boton.textContent ?? '').trim() === 'Cancelar',
    );
  }

  it('lista las reservas del cliente autenticado', async () => {
    await setup([resumen(1, 'PENDIENTE'), resumen(2, 'ATENDIDA')]);
    expect(reservasService.listarReservas).toHaveBeenCalled();

    const html: string = fixture.nativeElement.textContent;
    expect(html).toContain('Sucursal Centro');
    expect(html).toContain('Reserva #1');
    expect(html).toContain('PENDIENTE');
    expect(html).toContain('ATENDIDA');
  });

  it('muestra el estado vacío con CTA al catálogo', async () => {
    await setup([]);
    const html: string = fixture.nativeElement.textContent;
    expect(html).toContain('No tienes reservas todavía.');
    expect(
      fixture.nativeElement.querySelector('a[href="/catalogo"]'),
    ).toBeTruthy();
  });

  it('ofrece cancelar solo para PENDIENTE y CONFIRMADA', async () => {
    await setup([resumen(1, 'PENDIENTE'), resumen(2, 'CONFIRMADA')]);
    expect(botonesCancelar().length).toBe(2);
  });

  it('no ofrece cancelar para ATENDIDA, CANCELADA ni VENCIDA', async () => {
    await setup([
      resumen(1, 'ATENDIDA'),
      resumen(2, 'CANCELADA'),
      resumen(3, 'VENCIDA'),
    ]);
    expect(botonesCancelar().length).toBe(0);
  });

  it('filtra por estado usando GET /reservas?estado=', async () => {
    await setup([resumen(1, 'PENDIENTE')]);
    componente.cambiarEstado({
      target: { value: 'CONFIRMADA' },
    } as unknown as Event);
    expect(reservasService.listarReservas).toHaveBeenLastCalledWith(
      'CONFIRMADA',
    );
  });

  it('cancela una reserva con confirmación y recarga el listado', async () => {
    await setup([resumen(1, 'PENDIENTE')]);

    componente.solicitarCancelar(resumen(1, 'PENDIENTE'));
    expect(componente.pendienteCancelar()).not.toBeNull();

    componente.confirmarCancelar();

    expect(reservasService.cancelarReserva).toHaveBeenCalledWith(1, null);
    expect(toast.mostrar).toHaveBeenCalledWith('Reserva cancelada.', 'ok');
    expect(reservasService.listarReservas).toHaveBeenCalledTimes(2);
  });
});
