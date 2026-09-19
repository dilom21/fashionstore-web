import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { of } from 'rxjs';

import { ToastService } from '../../../../core/services/toast.service';
import {
  EstadoReserva,
  ReservaDetalle,
} from '../../models/reserva.model';
import { ReservasService } from '../../services/reservas.service';
import { ReservaDetallePage } from './reserva-detalle-page';

const DETALLE: ReservaDetalle = {
  reserva_id: 55,
  carrito_id: 7,
  cliente_id: 3,
  sucursal_id: 2,
  sucursal_nombre: 'Sucursal Centro',
  fecha_reserva: '2026-09-18T11:00:00+00:00',
  fecha_atencion: '2026-09-20T10:00:00',
  estado: 'PENDIENTE',
  observacion: 'Llego por la tarde',
  items: [
    {
      detalle_id: 1,
      inventario_id: 9,
      producto_id: 8,
      producto_nombre: 'Camisa Oxford',
      imagen_principal: null,
      variante_producto_id: 3,
      sku: 'OXF-M-NEG',
      talla_id: 2,
      talla_nombre: 'M',
      color_id: 1,
      color_nombre: 'Negro',
      temporada_id: 1,
      temporada_nombre: 'Primavera-Verano 2026',
      cantidad: 2,
    },
  ],
  cantidad_total_unidades: 2,
};

describe('ReservaDetallePage (CU16)', () => {
  let fixture: ComponentFixture<ReservaDetallePage>;
  let componente: ReservaDetallePage;
  let reservasService: {
    obtenerReserva: ReturnType<typeof vi.fn>;
    cancelarReserva: ReturnType<typeof vi.fn>;
    esCancelable: (estado: string) => boolean;
  };
  let toast: any;

  async function setup(estado: EstadoReserva) {
    const detalle: ReservaDetalle = { ...DETALLE, estado };
    reservasService = {
      obtenerReserva: vi.fn(() => of(detalle)),
      cancelarReserva: vi.fn(() => of({ ...detalle, estado: 'CANCELADA' })),
      esCancelable: (valor: string) =>
        ['PENDIENTE', 'CONFIRMADA'].includes(
          (valor ?? '').trim().toUpperCase(),
        ),
    };
    toast = { mostrar: vi.fn(), toasts: signal([]), cerrar: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [ReservaDetallePage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ReservasService, useValue: reservasService },
        { provide: ToastService, useValue: toast },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ reserva_id: '55' }) },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReservaDetallePage);
    componente = fixture.componentInstance;
    fixture.detectChanges();
  }

  function botonCancelar(): HTMLButtonElement | null {
    const botones = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ) as HTMLButtonElement[];
    return (
      botones.find((boton) =>
        (boton.textContent ?? '').toUpperCase().includes('CANCELAR RESERVA'),
      ) ?? null
    );
  }

  it('muestra el detalle real de la reserva y sus prendas', async () => {
    await setup('PENDIENTE');
    expect(reservasService.obtenerReserva).toHaveBeenCalledWith(55);

    const html: string = fixture.nativeElement.textContent;
    expect(html).toContain('Reserva #55');
    expect(html).toContain('Sucursal Centro');
    expect(html).toContain('Camisa Oxford');
    expect(html).toContain('SKU: OXF-M-NEG');
    expect(html).toContain('Llego por la tarde');
    // Fecha/hora sin desplazamiento de zona horaria.
    expect(html).toContain('20/09/2026 10:00');
  });

  it('no ofrece controles de cantidad ni edición', async () => {
    await setup('PENDIENTE');
    const botones = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ) as HTMLButtonElement[];
    const etiquetas = botones.map((boton) => (boton.textContent ?? '').trim());
    expect(etiquetas.some((t) => t === '+' || t === '-' || t === '−')).toBe(
      false,
    );
    expect(etiquetas.some((t) => t.toLowerCase().includes('eliminar'))).toBe(
      false,
    );
  });

  it('permite cancelar cuando está PENDIENTE', async () => {
    await setup('PENDIENTE');
    expect(componente.puedeCancelar()).toBe(true);
    expect(botonCancelar()).not.toBeNull();
  });

  it('permite cancelar cuando está CONFIRMADA', async () => {
    await setup('CONFIRMADA');
    expect(componente.puedeCancelar()).toBe(true);
    expect(botonCancelar()).not.toBeNull();
  });

  it('no permite cancelar cuando está ATENDIDA', async () => {
    await setup('ATENDIDA');
    expect(componente.puedeCancelar()).toBe(false);
    expect(botonCancelar()).toBeNull();
  });

  it('no permite cancelar cuando está CANCELADA', async () => {
    await setup('CANCELADA');
    expect(componente.puedeCancelar()).toBe(false);
    expect(botonCancelar()).toBeNull();
  });

  it('no permite cancelar cuando está VENCIDA', async () => {
    await setup('VENCIDA');
    expect(componente.puedeCancelar()).toBe(false);
    expect(botonCancelar()).toBeNull();
  });

  it('cancela con confirmación y actualiza la vista con la respuesta', async () => {
    await setup('PENDIENTE');

    componente.solicitarCancelar();
    expect(componente.mostrandoConfirmacion()).toBe(true);

    componente.confirmarCancelar();
    fixture.detectChanges();

    expect(reservasService.cancelarReserva).toHaveBeenCalledWith(55, null);
    expect(componente.reserva()?.estado).toBe('CANCELADA');
    expect(toast.mostrar).toHaveBeenCalledWith('Reserva cancelada.', 'ok');
    // El botón desaparece tras cancelar.
    expect(botonCancelar()).toBeNull();
  });
});
