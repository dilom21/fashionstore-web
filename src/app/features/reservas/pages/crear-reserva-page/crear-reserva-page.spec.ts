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

import { ToastService } from '../../../../core/services/toast.service';
import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import { CarritoDetalle } from '../../../carrito/models/carrito.model';
import { CarritoService } from '../../../carrito/services/carrito.service';
import { ReservaDetalle } from '../../models/reserva.model';
import { ReservasService } from '../../services/reservas.service';
import { CrearReservaPage } from './crear-reserva-page';

const CARRITO: CarritoDetalle = {
  carrito_id: 7,
  sucursal_id: 2,
  sucursal_nombre: 'Sucursal Centro',
  estado: 'ACTIVO',
  fecha_creacion: '2026-09-18T10:00:00+00:00',
  fecha_actualizacion: '2026-09-18T10:05:00+00:00',
  items: [
    {
      detalle_id: 1,
      inventario_id: 9,
      producto_id: 8,
      producto_nombre: 'Camisa Oxford',
      precio_unitario: 149.9,
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
      stock_disponible: 10,
      subtotal_linea: 299.8,
    },
  ],
  cantidad_total_unidades: 2,
  subtotal_carrito: 299.8,
};

const RESERVA: ReservaDetalle = {
  reserva_id: 55,
  carrito_id: 7,
  cliente_id: 3,
  sucursal_id: 2,
  sucursal_nombre: 'Sucursal Centro',
  fecha_reserva: '2026-09-18T11:00:00+00:00',
  fecha_atencion: '2026-09-20T10:00:00',
  estado: 'PENDIENTE',
  observacion: null,
  items: [],
  cantidad_total_unidades: 2,
};

function crearMockCarrito(carrito: CarritoDetalle | null) {
  return {
    totalCarritosActivos: signal(0),
    carritos: signal([]),
    cargandoLista: signal(false),
    obtenerCarrito: vi.fn(() =>
      carrito ? of(carrito) : throwError(() => new HttpErrorResponse({ status: 404 })),
    ),
    listarCarritos: vi.fn(() => of({ items: [], total_carritos_activos: 0 })),
    estaActivo: (detalle: { estado?: string }) =>
      (detalle?.estado ?? '').trim().toUpperCase() === 'ACTIVO',
    refrescarContador: vi.fn(),
    limpiar: vi.fn(),
    agregarItem: vi.fn(),
    actualizarCantidad: vi.fn(),
    eliminarDetalle: vi.fn(),
    eliminarCarrito: vi.fn(),
  };
}

describe('CrearReservaPage (CU16)', () => {
  let fixture: ComponentFixture<CrearReservaPage>;
  let componente: CrearReservaPage;
  let carritoService: ReturnType<typeof crearMockCarrito>;
  let reservasService: { crearReserva: ReturnType<typeof vi.fn> };
  let toast: any;
  let navigateSpy: any;

  async function setup(carrito: CarritoDetalle | null = CARRITO) {
    carritoService = crearMockCarrito(carrito);
    reservasService = { crearReserva: vi.fn(() => of(RESERVA)) };
    toast = { mostrar: vi.fn(), toasts: signal([]), cerrar: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [CrearReservaPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CarritoService, useValue: carritoService },
        { provide: ReservasService, useValue: reservasService },
        { provide: ToastService, useValue: toast },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ carrito_id: '7' }) },
          },
        },
      ],
    }).compileComponents();

    navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(CrearReservaPage);
    componente = fixture.componentInstance;
    fixture.detectChanges();
  }

  function fechaFutura(): string {
    const manana = new Date(Date.now() + 86_400_000);
    const mes = String(manana.getMonth() + 1).padStart(2, '0');
    const dia = String(manana.getDate()).padStart(2, '0');
    return `${manana.getFullYear()}-${mes}-${dia}`;
  }

  it('carga el carrito y muestra la sucursal como informativa (sin selector)', async () => {
    await setup();
    expect(carritoService.obtenerCarrito).toHaveBeenCalledWith(7);
    expect(componente.carrito()).not.toBeNull();

    const html: string = fixture.nativeElement.textContent;
    expect(html).toContain('Sucursal Centro');
    expect(html).toContain('no puede modificarse');
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
  });

  it('muestra las prendas en solo lectura (sin +/- ni eliminar)', async () => {
    await setup();
    const html: string = fixture.nativeElement.textContent;
    expect(html).toContain('Camisa Oxford');
    expect(html).toContain('SKU: OXF-M-NEG');

    const botones = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ) as HTMLButtonElement[];
    const etiquetas = botones.map((boton) => (boton.textContent ?? '').trim());
    expect(etiquetas.some((t) => t === '+' || t === '-' || t === '−')).toBe(false);
    expect(
      etiquetas.some((t) => t.toLowerCase().includes('eliminar')),
    ).toBe(false);
  });

  it('sin fecha ni hora no envía la petición y muestra el aviso', async () => {
    await setup();
    expect(componente.puedeConfirmar()).toBe(false);
    componente.confirmarReserva();
    expect(reservasService.crearReserva).not.toHaveBeenCalled();
    expect(componente.errorFecha()).toBeTruthy();
  });

  it('rechaza una fecha/hora que no es futura', async () => {
    await setup();
    componente.fecha.set('2020-01-01');
    componente.hora.set('10:00');
    componente.confirmarReserva();
    expect(reservasService.crearReserva).not.toHaveBeenCalled();
    expect(componente.errorFecha()).toContain('futura');
  });

  it('envía el POST correcto, refresca el contador y navega al detalle', async () => {
    await setup();
    const fecha = fechaFutura();
    componente.fecha.set(fecha);
    componente.hora.set('10:00');
    componente.observacion.set('Llego con un amigo');

    componente.confirmarReserva();

    expect(reservasService.crearReserva).toHaveBeenCalledTimes(1);
    const payload = reservasService.crearReserva.mock.calls[0][0];
    expect(payload).toEqual({
      carrito_id: 7,
      fecha_atencion: `${fecha}T10:00:00`,
      observacion: 'Llego con un amigo',
    });
    // El cliente y la sucursal los resuelve el backend desde el JWT y el carrito.
    expect('cliente_id' in payload).toBe(false);
    expect('sucursal_id' in payload).toBe(false);

    expect(toast.mostrar).toHaveBeenCalledWith(
      'Reserva creada correctamente.',
      'ok',
    );
    expect(carritoService.refrescarContador).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(['/reservas', 55]);
  });

  it('envía observacion null cuando el campo queda vacío', async () => {
    await setup();
    componente.fecha.set(fechaFutura());
    componente.hora.set('09:30');
    componente.observacion.set('   ');
    componente.confirmarReserva();
    expect(reservasService.crearReserva.mock.calls[0][0].observacion).toBeNull();
  });

  it('maneja 409 mostrando el motivo y ofreciendo volver al carrito', async () => {
    await setup();
    reservasService.crearReserva = vi.fn(() =>
      throwError(() => new HttpErrorResponse({ status: 409 })),
    );
    componente.fecha.set(fechaFutura());
    componente.hora.set('10:00');

    componente.confirmarReserva();

    expect(componente.error()).toBeTruthy();
    expect(componente.volverAlCarrito()).toBe(true);
    expect(navigateSpy).not.toHaveBeenCalledWith(['/reservas', 55]);
  });

  it('maneja 422 con un mensaje de validación', async () => {
    await setup();
    reservasService.crearReserva = vi.fn(() =>
      throwError(() => new HttpErrorResponse({ status: 422 })),
    );
    componente.fecha.set(fechaFutura());
    componente.hora.set('10:00');

    componente.confirmarReserva();

    expect(componente.error()?.toLowerCase()).toContain('fecha');
  });

  it('maneja 401 cerrando la sesión', async () => {
    await setup();
    const auth = TestBed.inject(AuthService);
    const cerrarSesion = vi
      .spyOn(auth, 'cerrarSesion')
      .mockImplementation(() => undefined);
    reservasService.crearReserva = vi.fn(() =>
      throwError(() => new HttpErrorResponse({ status: 401 })),
    );
    componente.fecha.set(fechaFutura());
    componente.hora.set('10:00');

    componente.confirmarReserva();

    expect(cerrarSesion).toHaveBeenCalled();
  });

  it('si el carrito ya no está activo vuelve al listado de carritos', async () => {
    await setup({ ...CARRITO, estado: 'CONVERTIDO' });
    expect(componente.carrito()).toBeNull();
    expect(toast.mostrar).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(['/carritos']);
  });

  it('si el carrito no existe (404) vuelve al listado de carritos', async () => {
    await setup(null);
    expect(componente.carrito()).toBeNull();
    expect(navigateSpy).toHaveBeenCalledWith(['/carritos']);
  });
});
