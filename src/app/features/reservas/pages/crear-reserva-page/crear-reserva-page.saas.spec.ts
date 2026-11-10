import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  Router,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { of, throwError } from 'rxjs';

import { SAAS_MODE } from '../../../../core/config/app-mode';
import { ToastService } from '../../../../core/services/toast.service';
import { CarritoDetalle } from '../../../carrito/models/carrito.model';
import { CarritoService } from '../../../carrito/services/carrito.service';
import { TenantApiService } from '../../../saas/services/tenant-api.service';
import { ReservasService } from '../../services/reservas.service';
import { CrearReservaPage } from './crear-reserva-page';

const CARRITO: CarritoDetalle = {
  carrito_id: 7,
  sucursal_id: 2,
  sucursal_nombre: 'Sucursal Centro',
  estado: 'ACTIVO',
  fecha_creacion: '2026-11-09T10:00:00+00:00',
  fecha_actualizacion: '2026-11-09T10:05:00+00:00',
  items: [],
  cantidad_total_unidades: 2,
  subtotal_carrito: 299.8,
};

const PREVALIDACION = {
  carrito_id: 7,
  sucursal_id: 2,
  fecha_atencion: '2026-11-10T15:00:00.000Z',
  cantidad_lineas: 1,
  cantidad_unidades: 2,
  stock_verificado_preliminarmente: true,
  reserva_creada: false,
  requiere_verificacion_transaccional: true,
};

function fechaFutura(): string {
  const manana = new Date(Date.now() + 86_400_000);
  const mes = String(manana.getMonth() + 1).padStart(2, '0');
  const dia = String(manana.getDate()).padStart(2, '0');
  return `${manana.getFullYear()}-${mes}-${dia}`;
}

describe('CrearReservaPage — flujo SaaS (prevalidar + crear)', () => {
  let fixture: ComponentFixture<CrearReservaPage>;
  let componente: CrearReservaPage;
  let reservas: {
    prevalidarReserva: ReturnType<typeof vi.fn>;
    crearReserva: ReturnType<typeof vi.fn>;
  };
  let toast: any;
  let navigateSpy: any;

  async function setup(opciones: { empresaSlug?: string } = {}) {
    const carritoService = {
      totalCarritosActivos: signal(0),
      carritos: signal([]),
      cargandoLista: signal(false),
      obtenerCarrito: vi.fn(() => of(CARRITO)),
      estaActivo: (detalle: { estado?: string }) =>
        (detalle?.estado ?? '').trim().toUpperCase() === 'ACTIVO',
      refrescarContador: vi.fn(),
      limpiar: vi.fn(),
      cerrarSesionCliente: vi.fn(),
    };
    reservas = {
      prevalidarReserva: vi.fn(() => of(PREVALIDACION)),
      crearReserva: vi.fn(() => of({ reserva_id: 55, carrito_id: 7, estado: 'PENDIENTE' })),
    };
    toast = { mostrar: vi.fn(), toasts: signal([]), cerrar: vi.fn() };
    const tenant = {
      contexto: () => 'cliente',
      autenticado: () => true,
      identidad: () => ({ empresa_slug: opciones.empresaSlug ?? 'vanter-men' }),
      cerrarSesion: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [CrearReservaPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SAAS_MODE, useValue: true },
        { provide: CarritoService, useValue: carritoService },
        { provide: ReservasService, useValue: reservas },
        { provide: TenantApiService, useValue: tenant },
        { provide: ToastService, useValue: toast },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ carrito_id: '7' }) },
          },
        },
      ],
    }).compileComponents();

    navigateSpy = vi
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockResolvedValue(true);
    fixture = TestBed.createComponent(CrearReservaPage);
    componente = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  it('prevalida (sin crear) y solo crea después; el éxito aparece con la creación', async () => {
    await setup();
    componente.fecha.set(fechaFutura());
    componente.hora.set('10:00');

    componente.confirmarReserva();

    expect(reservas.prevalidarReserva).toHaveBeenCalledTimes(1);
    expect(reservas.crearReserva).toHaveBeenCalledTimes(1);
    // El único mensaje de éxito es el de la creación real (no el de prevalidar).
    expect(toast.mostrar).toHaveBeenCalledTimes(1);
    expect(toast.mostrar).toHaveBeenCalledWith(
      'Reserva creada correctamente.',
      'ok',
    );
    expect(navigateSpy).toHaveBeenCalledWith(['/reservas', 55]);
  });

  it('si la prevalidación falla (409), NO se crea la reserva', async () => {
    await setup();
    reservas.prevalidarReserva = vi.fn(() =>
      throwError(() => new HttpErrorResponse({ status: 409 })),
    );
    componente.fecha.set(fechaFutura());
    componente.hora.set('10:00');

    componente.confirmarReserva();

    expect(reservas.prevalidarReserva).toHaveBeenCalledTimes(1);
    expect(reservas.crearReserva).not.toHaveBeenCalled();
    expect(toast.mostrar).not.toHaveBeenCalledWith(
      'Reserva creada correctamente.',
      'ok',
    );
    expect(componente.volverAlCarrito()).toBe(true);
  });

  it('no envía nada si la sesión es de otra empresa', async () => {
    await setup({ empresaSlug: 'otra-empresa' });
    componente.fecha.set(fechaFutura());
    componente.hora.set('10:00');

    expect(componente.empresaIncoherente()).toBe(true);
    expect(componente.puedeConfirmar()).toBe(false);

    componente.confirmarReserva();
    expect(reservas.prevalidarReserva).not.toHaveBeenCalled();
    expect(reservas.crearReserva).not.toHaveBeenCalled();
    expect(componente.error()).toBeTruthy();
  });
});
