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
import { Subject, of, throwError } from 'rxjs';

import { ToastService } from '../../../../core/services/toast.service';
import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import { CarritoDetalle } from '../../../carrito/models/carrito.model';
import { CarritoService } from '../../../carrito/services/carrito.service';
import { VentaDigitalResponse } from '../../models/venta-digital.model';
import { VentaDigitalService } from '../../services/venta-digital.service';
import { CheckoutDigitalPage } from './checkout-digital-page';

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

const VENTA: VentaDigitalResponse = {
  venta_id: 123,
  carrito_id: 7,
  cliente_id: 3,
  sucursal_id: 2,
  sucursal_nombre: 'Sucursal Centro',
  canal: 'WEB',
  estado: 'PENDIENTE',
  fecha_hora: '2026-09-19T10:00:00+00:00',
  total: 299.8,
  items: [],
  cantidad_total_unidades: 2,
};

function crearMockCarrito(carrito: CarritoDetalle | null) {
  return {
    totalCarritosActivos: signal(0),
    carritos: signal([]),
    cargandoLista: signal(false),
    obtenerCarrito: vi.fn(() =>
      carrito
        ? of(carrito)
        : throwError(() => new HttpErrorResponse({ status: 404 })),
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

describe('CheckoutDigitalPage (CU19)', () => {
  let fixture: ComponentFixture<CheckoutDigitalPage>;
  let componente: CheckoutDigitalPage;
  let carritoService: ReturnType<typeof crearMockCarrito>;
  let ventaService: { realizarCompra: ReturnType<typeof vi.fn> };
  let toast: any;
  let navigateSpy: any;

  async function setup(
    carrito: CarritoDetalle | null = CARRITO,
    param = '7',
  ) {
    carritoService = crearMockCarrito(carrito);
    ventaService = { realizarCompra: vi.fn(() => of(VENTA)) };
    toast = { mostrar: vi.fn(), toasts: signal([]), cerrar: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [CheckoutDigitalPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CarritoService, useValue: carritoService },
        { provide: VentaDigitalService, useValue: ventaService },
        { provide: ToastService, useValue: toast },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ carrito_id: param }) },
          },
        },
      ],
    }).compileComponents();

    navigateSpy = vi
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockResolvedValue(true);

    fixture = TestBed.createComponent(CheckoutDigitalPage);
    componente = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('carga el carrito correcto y renderiza el resumen', async () => {
    await setup();

    expect(carritoService.obtenerCarrito).toHaveBeenCalledWith(7);
    const html: string = fixture.nativeElement.textContent;
    expect(html).toContain('Camisa Oxford');
    expect(html).toContain('Sucursal Centro');
    expect(html).toContain('299.80');
    expect(html).toContain('CONFIRMAR COMPRA');
  });

  it('no incluye inputs de tarjeta ni Stripe (CU22 fuera de alcance)', async () => {
    await setup();
    expect(fixture.nativeElement.querySelectorAll('input').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('iframe').length).toBe(0);
    expect(
      fixture.nativeElement.querySelector('[name*="card" i]'),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[autocomplete*="cc-" i]'),
    ).toBeNull();
    const html: string = fixture.nativeElement.textContent.toLowerCase();
    expect(html).not.toContain('cvv');
    expect(html).not.toContain('fecha de expiración');
  });

  it('confirma la compra una sola vez con el carrito correcto', async () => {
    await setup();
    componente.confirmarCompra();

    expect(ventaService.realizarCompra).toHaveBeenCalledTimes(1);
    expect(ventaService.realizarCompra).toHaveBeenCalledWith(7);
  });

  it('bloquea el doble click mientras procesa', async () => {
    await setup();
    const pendiente = new Subject<VentaDigitalResponse>();
    ventaService.realizarCompra = vi.fn(() => pendiente.asObservable());

    componente.confirmarCompra();
    componente.confirmarCompra();

    expect(ventaService.realizarCompra).toHaveBeenCalledTimes(1);
    expect(componente.procesando()).toBe(true);

    pendiente.next(VENTA);
    pendiente.complete();
    expect(componente.procesando()).toBe(false);
    expect(componente.ventaCreada()).not.toBeNull();
  });

  it('tras el 201 muestra la venta PENDIENTE y refresca el contador', async () => {
    await setup();
    componente.confirmarCompra();
    fixture.detectChanges();

    const html: string = fixture.nativeElement.textContent;
    expect(html).toContain('Compra preparada');
    expect(html).toContain('#123');
    expect(html).toContain('PENDIENTE DE PAGO');
    expect(html).toContain('299.80');
    expect(carritoService.refrescarContador).toHaveBeenCalled();
  });

  it('no vuelve a consultar el carrito convertido tras el éxito', async () => {
    await setup();
    componente.confirmarCompra();
    expect(carritoService.obtenerCarrito).toHaveBeenCalledTimes(1);
  });

  it('401 cierra la sesión y redirige al login', async () => {
    await setup();
    const auth = TestBed.inject(AuthService);
    const cerrarSesion = vi
      .spyOn(auth, 'cerrarSesion')
      .mockImplementation(() => undefined);
    ventaService.realizarCompra = vi.fn(() =>
      throwError(() => new HttpErrorResponse({ status: 401 })),
    );

    componente.confirmarCompra();

    expect(cerrarSesion).toHaveBeenCalled();
    expect(carritoService.limpiar).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(
      ['/login'],
      expect.objectContaining({ queryParams: expect.anything() }),
    );
  });

  it('403 muestra un mensaje claro', async () => {
    await setup();
    ventaService.realizarCompra = vi.fn(() =>
      throwError(() => new HttpErrorResponse({ status: 403 })),
    );

    componente.confirmarCompra();

    expect(componente.error()).toBeTruthy();
    expect(componente.volverAlCarrito()).toBe(false);
  });

  it('409 con stock insuficiente se traduce y permite volver', async () => {
    await setup();
    ventaService.realizarCompra = vi.fn(() =>
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { detail: 'Stock insuficiente para completar la compra' },
          }),
      ),
    );

    componente.confirmarCompra();

    expect(componente.error()?.toLowerCase()).toContain('stock');
    expect(componente.volverAlCarrito()).toBe(true);
  });

  it('409 con venta ya preparada se informa sin volver al carrito', async () => {
    await setup();
    ventaService.realizarCompra = vi.fn(() =>
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { detail: 'El carrito ya fue convertido en una venta' },
          }),
      ),
    );

    componente.confirmarCompra();

    expect(componente.error()?.toLowerCase()).toContain('preparada');
    expect(componente.volverAlCarrito()).toBe(false);
  });

  it('si el carrito no existe (404) vuelve al listado', async () => {
    await setup(null);
    expect(componente.carrito()).toBeNull();
    expect(navigateSpy).toHaveBeenCalledWith(['/carritos']);
  });

  it('si el carrito ya no está activo vuelve al listado', async () => {
    await setup({ ...CARRITO, estado: 'CONVERTIDO' });
    expect(componente.carrito()).toBeNull();
    expect(navigateSpy).toHaveBeenCalledWith(['/carritos']);
  });

  it('con un carrito_id inválido no consulta ni permite confirmar', async () => {
    await setup(CARRITO, 'abc');
    expect(carritoService.obtenerCarrito).not.toHaveBeenCalled();
    expect(componente.puedeConfirmar()).toBe(false);
    expect(componente.error()).toContain('válido');
  });

  it('un error de red no borra el carrito cargado', async () => {
    await setup();
    ventaService.realizarCompra = vi.fn(() =>
      throwError(() => new HttpErrorResponse({ status: 0 })),
    );

    componente.confirmarCompra();

    expect(componente.carrito()).not.toBeNull();
    expect(componente.ventaCreada()).toBeNull();
    expect(componente.error()).toBeTruthy();
  });

  it('volver al carrito navega al detalle del carrito', async () => {
    await setup();
    componente.volverAlCarritoActual();
    expect(navigateSpy).toHaveBeenCalledWith(['/carritos', 7]);
  });

  it('muestra el CTA real CONTINUAR AL PAGO tras crear la venta (CU22)', async () => {
    await setup();
    componente.confirmarCompra();
    fixture.detectChanges();

    const html: string = fixture.nativeElement.textContent;
    expect(html).toContain('CONTINUAR AL PAGO');
    expect(html).not.toContain('PRÓXIMAMENTE');
  });

  it('CONTINUAR AL PAGO navega a /pagos/stripe/:venta_id sin crear otra venta', async () => {
    await setup();
    componente.confirmarCompra();
    expect(ventaService.realizarCompra).toHaveBeenCalledTimes(1);

    componente.continuarAlPago();

    expect(navigateSpy).toHaveBeenCalledWith(['/pagos/stripe', 123]);
    // No se vuelve a crear la venta al continuar al pago.
    expect(ventaService.realizarCompra).toHaveBeenCalledTimes(1);
  });

  it('CONTINUAR AL PAGO no navega si aún no hay venta creada', async () => {
    await setup();
    componente.continuarAlPago();
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
