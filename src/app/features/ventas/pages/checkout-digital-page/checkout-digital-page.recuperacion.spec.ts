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
import { Observable, of, throwError } from 'rxjs';

import { SAAS_MODE } from '../../../../core/config/app-mode';
import { ToastService } from '../../../../core/services/toast.service';
import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import { CarritoDetalle } from '../../../carrito/models/carrito.model';
import { CarritoService } from '../../../carrito/services/carrito.service';
import { TenantApiService } from '../../../saas/services/tenant-api.service';
import { EstadoPagoVentaResponse } from '../../models/pago-electronico.model';
import { VentaDigitalResponse } from '../../models/venta-digital.model';
import { PagoElectronicoService } from '../../services/pago-electronico.service';
import { VentaDigitalService } from '../../services/venta-digital.service';
import {
  guardarVentaPendiente,
  obtenerVentaPendiente,
} from '../../utils/checkout-pendiente.storage';
import { CheckoutDigitalPage } from './checkout-digital-page';

const CARRITO: CarritoDetalle = {
  carrito_id: 7,
  sucursal_id: 2,
  sucursal_nombre: 'Sucursal Centro',
  estado: 'CONVERTIDO',
  fecha_creacion: '2026-11-10T10:00:00+00:00',
  fecha_actualizacion: '2026-11-10T10:05:00+00:00',
  items: [],
  cantidad_total_unidades: 0,
  subtotal_carrito: 0,
};

const VENTA: VentaDigitalResponse = {
  venta_id: 694,
  carrito_id: 7,
  cliente_id: 3,
  sucursal_id: 2,
  sucursal_nombre: 'Sucursal Centro',
  canal: 'WEB',
  estado: 'PENDIENTE',
  fecha_hora: '2026-11-10T10:00:00+00:00',
  total: 89.9,
  items: [],
  cantidad_total_unidades: 1,
};

interface Opciones {
  carrito?: CarritoDetalle;
  saasMode?: boolean;
  ventaIdRecordada?: number;
  estadoBackend?: Partial<EstadoPagoVentaResponse>;
  errorEstado?: HttpErrorResponse;
}

interface Contexto {
  fixture: ComponentFixture<CheckoutDigitalPage>;
  componente: CheckoutDigitalPage;
  carritoService: ReturnType<typeof crearMockCarrito>;
  ventaService: { realizarCompra: ReturnType<typeof vi.fn> };
  pagoService: { consultarEstado: ReturnType<typeof vi.fn> };
  toast: { mostrar: ReturnType<typeof vi.fn> };
  navigateSpy: ReturnType<typeof vi.fn>;
}

function crearMockCarrito(carrito: CarritoDetalle) {
  return {
    totalCarritosActivos: signal(0),
    carritos: signal([]),
    cargandoLista: signal(false),
    obtenerCarrito: vi.fn(() => of(carrito)),
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

function estadoValido(
  ventaId: number,
  extra: Partial<EstadoPagoVentaResponse> = {},
): EstadoPagoVentaResponse {
  return {
    venta_id: ventaId,
    estado_venta: 'PENDIENTE',
    pago_id: null,
    estado_pago: 'PENDIENTE',
    payment_intent_id: null,
    ...extra,
  };
}

async function setup(opciones: Opciones = {}): Promise<Contexto> {
  sessionStorage.clear();

  const carrito = opciones.carrito ?? CARRITO;
  const carritoService = crearMockCarrito(carrito);
  const ventaService = { realizarCompra: vi.fn(() => of(VENTA)) };
  const pagoService = {
    consultarEstado: vi.fn(
      (ventaId: number): Observable<EstadoPagoVentaResponse> =>
        opciones.errorEstado
          ? throwError(() => opciones.errorEstado)
          : of(estadoValido(ventaId, opciones.estadoBackend)),
    ),
  };
  const toast = { mostrar: vi.fn(), toasts: signal([]), cerrar: vi.fn() };

  if (opciones.ventaIdRecordada !== undefined) {
    guardarVentaPendiente(carrito.carrito_id, opciones.ventaIdRecordada);
  }

  await TestBed.configureTestingModule({
    imports: [CheckoutDigitalPage],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: SAAS_MODE, useValue: opciones.saasMode ?? false },
      { provide: CarritoService, useValue: carritoService },
      { provide: VentaDigitalService, useValue: ventaService },
      { provide: PagoElectronicoService, useValue: pagoService },
      { provide: ToastService, useValue: toast },
      {
        provide: TenantApiService,
        useValue: {
          contexto: signal(null),
          identidad: signal(null),
          cerrarSesion: vi.fn(),
        },
      },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: convertToParamMap({ carrito_id: '7' }) },
        },
      },
    ],
  }).compileComponents();

  const navigateSpy = vi.fn().mockResolvedValue(true);
  vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(navigateSpy);

  const fixture = TestBed.createComponent(CheckoutDigitalPage);
  const componente = fixture.componentInstance;
  fixture.detectChanges();

  return {
    fixture,
    componente,
    carritoService,
    ventaService,
    pagoService,
    toast,
    navigateSpy,
  };
}

describe('CheckoutDigitalPage - recuperación tras recarga', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('reanuda una venta PENDIENTE hacia /pagos/stripe/:venta_id', async () => {
    const ctx = await setup({
      ventaIdRecordada: 694,
      estadoBackend: { estado_venta: 'PENDIENTE', estado_pago: 'PENDIENTE' },
    });

    expect(ctx.pagoService.consultarEstado).toHaveBeenCalledWith(694);
    expect(ctx.navigateSpy).toHaveBeenCalledWith(['/pagos/stripe', 694]);
    expect(ctx.navigateSpy).not.toHaveBeenCalledWith(['/carritos']);
  });

  it('no crea una venta nueva ni una intención al recuperar (anti-duplicado)', async () => {
    const ctx = await setup({
      ventaIdRecordada: 694,
      estadoBackend: { estado_venta: 'PENDIENTE' },
    });

    expect(ctx.ventaService.realizarCompra).not.toHaveBeenCalled();
    expect(ctx.pagoService.consultarEstado).toHaveBeenCalledTimes(1);
    expect(ctx.carritoService.obtenerCarrito).toHaveBeenCalledTimes(1);
  });

  it('si la venta ya está COMPLETADA lleva al comprobante y limpia la pista', async () => {
    const ctx = await setup({
      ventaIdRecordada: 694,
      estadoBackend: { estado_venta: 'COMPLETADA', estado_pago: 'APROBADO' },
    });

    expect(ctx.navigateSpy).toHaveBeenCalledWith([
      '/ventas',
      694,
      'comprobante',
    ]);
    expect(ctx.navigateSpy).not.toHaveBeenCalledWith(['/pagos/stripe', 694]);
    expect(obtenerVentaPendiente(7)).toBeNull();
  });

  it('reconoce PAGADA como pago completado', async () => {
    const ctx = await setup({
      ventaIdRecordada: 694,
      estadoBackend: { estado_venta: 'PAGADA', estado_pago: 'APROBADO' },
    });

    expect(ctx.navigateSpy).toHaveBeenCalledWith([
      '/ventas',
      694,
      'comprobante',
    ]);
  });

  it('sin venta asociada vuelve al listado sin consultar el backend', async () => {
    const ctx = await setup();

    expect(ctx.pagoService.consultarEstado).not.toHaveBeenCalled();
    expect(ctx.navigateSpy).toHaveBeenCalledWith(['/carritos']);
    expect(ctx.componente.carrito()).toBeNull();
  });

  it('una venta de otro cliente (404) no permite continuar y limpia la pista', async () => {
    const ctx = await setup({
      ventaIdRecordada: 999,
      errorEstado: new HttpErrorResponse({ status: 404 }),
    });

    expect(ctx.navigateSpy).not.toHaveBeenCalledWith(['/pagos/stripe', 999]);
    expect(ctx.navigateSpy).not.toHaveBeenCalledWith([
      '/ventas',
      999,
      'comprobante',
    ]);
    expect(ctx.navigateSpy).toHaveBeenCalledWith(['/carritos']);
    expect(obtenerVentaPendiente(7)).toBeNull();
  });

  it('una venta ajena (403) tampoco permite continuar', async () => {
    const ctx = await setup({
      ventaIdRecordada: 999,
      errorEstado: new HttpErrorResponse({ status: 403 }),
    });

    expect(ctx.navigateSpy).not.toHaveBeenCalledWith(['/pagos/stripe', 999]);
    expect(ctx.navigateSpy).toHaveBeenCalledWith(['/carritos']);
    expect(obtenerVentaPendiente(7)).toBeNull();
  });

  it('un fallo de red conserva la pista para poder reintentar', async () => {
    const ctx = await setup({
      ventaIdRecordada: 694,
      errorEstado: new HttpErrorResponse({ status: 0 }),
    });

    expect(ctx.navigateSpy).not.toHaveBeenCalled();
    expect(ctx.componente.error()).toContain('Recarga');
    expect(obtenerVentaPendiente(7)).toBe(694);
  });

  it('un 503 conserva la pista y no navega al pago', async () => {
    const ctx = await setup({
      ventaIdRecordada: 694,
      errorEstado: new HttpErrorResponse({ status: 503 }),
    });

    expect(ctx.navigateSpy).not.toHaveBeenCalledWith(['/pagos/stripe', 694]);
    expect(obtenerVentaPendiente(7)).toBe(694);
  });

  it('un 401 cierra la sesión en lugar de continuar', async () => {
    const cerrarSesion = vi
      .spyOn(AuthService.prototype, 'cerrarSesion')
      .mockImplementation(() => undefined);

    const ctx = await setup({
      ventaIdRecordada: 694,
      errorEstado: new HttpErrorResponse({ status: 401 }),
    });

    expect(cerrarSesion).toHaveBeenCalled();
    expect(ctx.navigateSpy).toHaveBeenCalledWith(
      ['/login'],
      expect.objectContaining({ queryParams: expect.anything() }),
    );
    expect(ctx.navigateSpy).not.toHaveBeenCalledWith(['/pagos/stripe', 694]);
  });

  it('una venta CANCELADA no se reanuda ni se vuelve a cobrar', async () => {
    const ctx = await setup({
      ventaIdRecordada: 694,
      estadoBackend: { estado_venta: 'CANCELADA', estado_pago: 'REEMBOLSADO' },
    });

    expect(ctx.navigateSpy).not.toHaveBeenCalled();
    expect(ctx.componente.error()).toBeTruthy();
    expect(obtenerVentaPendiente(7)).toBeNull();
  });

  it('guarda la pista de la venta recién creada (para la recarga)', async () => {
    const ctx = await setup({
      carrito: { ...CARRITO, estado: 'ACTIVO' },
    });

    ctx.componente.confirmarCompra();

    expect(ctx.ventaService.realizarCompra).toHaveBeenCalledWith(7);
    expect(obtenerVentaPendiente(7)).toBe(694);
  });

  it('si el carrito se convirtió en otra pestaña (409) reanuda la venta', async () => {
    const ctx = await setup({
      carrito: { ...CARRITO, estado: 'ACTIVO' },
      ventaIdRecordada: 694,
      estadoBackend: { estado_venta: 'PENDIENTE' },
    });
    ctx.ventaService.realizarCompra = vi.fn(() =>
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { detail: 'El carrito ya fue convertido en una venta' },
          }),
      ),
    );

    ctx.componente.confirmarCompra();

    expect(ctx.pagoService.consultarEstado).toHaveBeenCalledWith(694);
    expect(ctx.navigateSpy).toHaveBeenCalledWith(['/pagos/stripe', 694]);
  });

  it('en modo SaaS recupera la venta con el servicio tenant', async () => {
    const ctx = await setup({
      saasMode: true,
      ventaIdRecordada: 694,
      estadoBackend: { estado_venta: 'PENDIENTE' },
    });

    expect(ctx.pagoService.consultarEstado).toHaveBeenCalledWith(694);
    expect(ctx.navigateSpy).toHaveBeenCalledWith(['/pagos/stripe', 694]);
  });

  it('legacy sin pista conserva el comportamiento original (listado)', async () => {
    const ctx = await setup({ saasMode: false });

    expect(ctx.pagoService.consultarEstado).not.toHaveBeenCalled();
    expect(ctx.navigateSpy).toHaveBeenCalledWith(['/carritos']);
  });
});
