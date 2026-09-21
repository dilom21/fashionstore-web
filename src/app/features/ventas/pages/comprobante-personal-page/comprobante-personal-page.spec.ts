import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  Router,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';

import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import { ComprobanteVenta } from '../../models/comprobante-venta.model';
import { ComprobanteVentaService } from '../../services/comprobante-venta.service';
import { ComprobantePersonalPage } from './comprobante-personal-page';

function comprobante(
  extra: Partial<ComprobanteVenta> = {},
): ComprobanteVenta {
  return {
    venta_id: 535,
    fecha_hora: '2026-09-19T10:00:00',
    canal: 'PRESENCIAL',
    estado_venta: 'COMPLETADA',
    total: 149.9,
    carrito_id: null,
    reserva_id: 44,
    cliente: null,
    empleado: { id: 9, nombres: 'Ana', apellidos: 'Quispe' },
    sucursal: {
      id: 1,
      nombre: 'Sucursal Centro',
      direccion: 'Av. Siempre Viva 123',
      telefono: null,
    },
    pago: {
      pago_id: 7,
      fecha_hora: '2026-09-19T10:00:00',
      monto: 149.9,
      metodo: 'EFECTIVO',
      estado: 'APROBADO',
      referencia_transaccion: null,
      pasarela: null,
    },
    items: [
      {
        detalle_venta_id: 1,
        inventario_id: 2,
        producto_id: 3,
        producto_nombre: 'Polo Premium Piqué',
        variante_producto_id: 4,
        sku: 'POL-PIQ-NEG-M',
        talla_nombre: 'M',
        color_nombre: 'Negro',
        cantidad: 1,
        precio_unitario: 149.9,
        subtotal_linea: 149.9,
      },
    ],
    cantidad_total_unidades: 1,
    ...extra,
  };
}

describe('ComprobantePersonalPage (CU23)', () => {
  let fixture: ComponentFixture<ComprobantePersonalPage>;
  let componente: ComprobantePersonalPage;
  let servicio: { obtenerComprobante: ReturnType<typeof vi.fn> };
  let auth: { cerrarSesion: ReturnType<typeof vi.fn> };
  let navigateSpy: ReturnType<typeof vi.spyOn>;

  interface Opciones {
    ventaId?: string;
    observable?: Observable<ComprobanteVenta>;
    error?: unknown;
    respuesta?: ComprobanteVenta;
  }

  async function setup(opciones: Opciones = {}): Promise<void> {
    servicio = {
      obtenerComprobante: vi.fn(() => {
        if (opciones.observable !== undefined) {
          return opciones.observable;
        }
        if (opciones.error !== undefined) {
          return throwError(() => opciones.error);
        }
        return of(opciones.respuesta ?? comprobante());
      }),
    };
    auth = { cerrarSesion: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [ComprobantePersonalPage],
      providers: [
        provideRouter([]),
        { provide: ComprobanteVentaService, useValue: servicio },
        { provide: AuthService, useValue: auth },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({
                venta_id: opciones.ventaId ?? '535',
              }),
            },
          },
        },
      ],
    }).compileComponents();

    navigateSpy = vi
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockResolvedValue(true);

    fixture = TestBed.createComponent(ComprobantePersonalPage);
    componente = fixture.componentInstance;
    fixture.detectChanges();
  }

  function texto(): string {
    return ((fixture.nativeElement as HTMLElement).textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function boton(etiqueta: string): HTMLButtonElement | undefined {
    return (
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
      ) as HTMLButtonElement[]
    ).find((elemento) =>
      (elemento.textContent ?? '').replace(/\s+/g, ' ').includes(etiqueta),
    );
  }

  it('carga el comprobante con el venta_id de la ruta', async () => {
    await setup();

    expect(servicio.obtenerComprobante).toHaveBeenCalledWith(535);
    expect(texto()).toContain('VTA-00535');
    expect(texto()).toContain('COMPLETADA');
    expect(texto()).toContain('registrada y pagada correctamente');
    expect(texto()).toContain('Cliente general');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'app-comprobante-venta-view',
      ),
    ).not.toBeNull();
  });

  it('mientras consulta muestra "Cargando comprobante…"', async () => {
    const pendiente = new Subject<ComprobanteVenta>();
    await setup({ observable: pendiente.asObservable() });

    expect(componente.cargando()).toBe(true);
    expect(texto()).toContain('Cargando comprobante…');

    pendiente.next(comprobante());
    pendiente.complete();
    fixture.detectChanges();

    expect(componente.cargando()).toBe(false);
    expect(texto()).toContain('VTA-00535');
  });

  it('403 muestra un mensaje de autorización controlado (sin reintentar)', async () => {
    await setup({ error: new HttpErrorResponse({ status: 403 }) });

    expect(texto()).toContain(
      'No tienes autorización para consultar este comprobante.',
    );
    expect(texto()).not.toContain('403');
    expect(boton('REINTENTAR')).toBeUndefined();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'app-comprobante-venta-view',
      ),
    ).toBeNull();
  });

  it('404 informa "Venta no encontrada"', async () => {
    await setup({ error: new HttpErrorResponse({ status: 404 }) });

    expect(texto()).toContain('Venta no encontrada');
    expect(boton('REINTENTAR')).toBeUndefined();
  });

  it('409 informa que el comprobante aún no está disponible', async () => {
    await setup({
      error: new HttpErrorResponse({
        status: 409,
        error: { detail: 'La venta aun no esta COMPLETADA' },
      }),
    });

    expect(texto()).toContain(
      'El comprobante aún no está disponible para esta venta.',
    );
  });

  it('un error de red ofrece REINTENTAR y vuelve a consultar', async () => {
    await setup({ error: new HttpErrorResponse({ status: 0 }) });

    expect(texto()).toContain(
      'No pudimos cargar el comprobante. Intenta nuevamente.',
    );

    servicio.obtenerComprobante.mockReturnValue(of(comprobante()));
    boton('REINTENTAR')?.click();
    fixture.detectChanges();

    expect(servicio.obtenerComprobante).toHaveBeenCalledTimes(2);
    expect(texto()).toContain('VTA-00535');
  });

  it('un 5xx se muestra como mensaje controlado con reintento', async () => {
    await setup({
      error: new HttpErrorResponse({
        status: 503,
        error: 'Internal Server Error',
      }),
    });

    expect(texto()).toContain(
      'No pudimos cargar el comprobante. Intenta nuevamente.',
    );
    expect(texto()).not.toContain('Internal Server Error');
    expect(boton('REINTENTAR')).toBeDefined();
  });

  it('401 cierra la sesión y va al login del personal', async () => {
    await setup({ error: new HttpErrorResponse({ status: 401 }) });

    expect(auth.cerrarSesion).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(
      ['/auth/personal/login'],
      expect.objectContaining({ queryParams: expect.anything() }),
    );
  });

  it('con venta_id inválido no llama al backend', async () => {
    await setup({ ventaId: 'abc' });

    expect(servicio.obtenerComprobante).not.toHaveBeenCalled();
    expect(texto()).toContain('Venta no encontrada');
  });

  it('VOLVER regresa al área de ventas presenciales (contexto CU20/CU18)', async () => {
    await setup();

    boton('VOLVER')?.click();

    expect(navigateSpy).toHaveBeenCalledWith(['/personal/ventas/presencial']);
  });

  it('desde el estado de error también se puede volver al área de ventas', async () => {
    await setup({ error: new HttpErrorResponse({ status: 404 }) });

    boton('Volver a ventas')?.click();

    expect(navigateSpy).toHaveBeenCalledWith(['/personal/ventas/presencial']);
  });
});
