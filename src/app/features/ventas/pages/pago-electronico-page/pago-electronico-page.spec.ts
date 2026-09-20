import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  Router,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';

import { StripeClientService } from '../../../../core/services/stripe-client.service';
import { ToastService } from '../../../../core/services/toast.service';
import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import { PagoElectronicoService } from '../../services/pago-electronico.service';
import { PagoElectronicoPage } from './pago-electronico-page';

const INTENCION = {
  venta_id: 123,
  pago_id: 55,
  payment_intent_id: 'pi_3TestABC',
  client_secret: 'pi_3TestABC_secret_xyz',
  monto: 299.8,
  moneda: 'bob',
  estado_pago: 'PENDIENTE',
};

const ESTADO_PENDIENTE = {
  venta_id: 123,
  estado_venta: 'PENDIENTE',
  pago_id: 55,
  estado_pago: 'PENDIENTE',
  payment_intent_id: 'pi_3TestABC',
};
const ESTADO_APROBADO = {
  ...ESTADO_PENDIENTE,
  estado_venta: 'COMPLETADA',
  estado_pago: 'APROBADO',
};
const ESTADO_RECHAZADO = {
  ...ESTADO_PENDIENTE,
  estado_venta: 'PENDIENTE',
  estado_pago: 'RECHAZADO',
};
const ESTADO_ANULADO = {
  ...ESTADO_PENDIENTE,
  estado_venta: 'PENDIENTE',
  estado_pago: 'ANULADO',
};
const ESTADO_CANCELADA_APROBADO = {
  ...ESTADO_PENDIENTE,
  estado_venta: 'CANCELADA',
  estado_pago: 'APROBADO',
};
const ESTADO_CANCELADA_REEMBOLSADO = {
  ...ESTADO_PENDIENTE,
  estado_venta: 'CANCELADA',
  estado_pago: 'REEMBOLSADO',
};

function crearStripeFake() {
  const paymentElement = { mount: vi.fn(), destroy: vi.fn() };
  const elements = { create: vi.fn(() => paymentElement) };
  const stripe = {
    elements: vi.fn(() => elements),
    confirmPayment: vi.fn(
      (_opciones?: unknown): Promise<unknown> =>
        Promise.resolve({ paymentIntent: { status: 'succeeded' } }),
    ),
  };
  return { stripe, elements, paymentElement };
}

interface Opciones {
  ventaId?: string;
  query?: Record<string, string>;
  intencion?: unknown;
  intencionError?: unknown;
  consultar?: () => Observable<unknown>;
  cargarStripe?: () => Promise<unknown>;
  claveConfigurada?: boolean;
  confirmResult?: unknown;
}

describe('PagoElectronicoPage (CU22)', () => {
  let fixture: ComponentFixture<PagoElectronicoPage>;
  let componente: PagoElectronicoPage;
  let pagoServiceMock: {
    crearIntencion: ReturnType<typeof vi.fn>;
    consultarEstado: ReturnType<typeof vi.fn>;
  };
  let stripeClientMock: {
    cargarStripe: ReturnType<typeof vi.fn>;
    claveConfigurada: boolean;
  };
  let stripeFake: ReturnType<typeof crearStripeFake>;
  let cerrarSesionSpy: ReturnType<typeof vi.spyOn>;
  let navigateSpy: ReturnType<typeof vi.spyOn>;

  async function setup(opciones: Opciones = {}): Promise<void> {
    stripeFake = crearStripeFake();
    if (opciones.confirmResult !== undefined) {
      stripeFake.stripe.confirmPayment.mockReturnValue(
        Promise.resolve(opciones.confirmResult),
      );
    }

    pagoServiceMock = {
      crearIntencion: vi.fn(() => {
        if (opciones.intencionError !== undefined) {
          return throwError(() => opciones.intencionError);
        }
        return of(opciones.intencion === undefined ? INTENCION : opciones.intencion);
      }),
      consultarEstado: vi.fn(
        opciones.consultar ?? (() => of(ESTADO_APROBADO)),
      ),
    };

    stripeClientMock = {
      cargarStripe: vi.fn(
        opciones.cargarStripe ?? (() => Promise.resolve(stripeFake.stripe)),
      ),
      claveConfigurada: opciones.claveConfigurada ?? true,
    };

    await TestBed.configureTestingModule({
      imports: [PagoElectronicoPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PagoElectronicoService, useValue: pagoServiceMock },
        { provide: StripeClientService, useValue: stripeClientMock },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({
                venta_id: opciones.ventaId ?? '123',
              }),
              queryParamMap: convertToParamMap(opciones.query ?? {}),
            },
          },
        },
      ],
    }).compileComponents();

    const auth = TestBed.inject(AuthService);
    cerrarSesionSpy = vi
      .spyOn(auth, 'cerrarSesion')
      .mockImplementation(() => undefined);
    navigateSpy = vi
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockResolvedValue(true);

    fixture = TestBed.createComponent(PagoElectronicoPage);
    componente = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('con venta_id inválido no llama al backend', async () => {
    await setup({ ventaId: 'abc' });

    expect(componente.idInvalido()).toBe(true);
    expect(pagoServiceMock.crearIntencion).not.toHaveBeenCalled();
  });

  it('crea la intención con el venta_id y monta el Payment Element', async () => {
    await setup();

    expect(pagoServiceMock.crearIntencion).toHaveBeenCalledWith(123);
    expect(componente.listoParaPagar()).toBe(true);
    expect(stripeFake.paymentElement.mount).toHaveBeenCalled();
  });

  it('no crea inputs de tarjeta: los datos sensibles los controla Stripe', async () => {
    await setup();

    expect(fixture.nativeElement.querySelectorAll('input').length).toBe(0);
    expect(
      fixture.nativeElement.querySelector('[autocomplete*="cc-" i]'),
    ).toBeNull();
  });

  it('muestra venta, monto y moneda del backend', async () => {
    await setup();

    const html: string = fixture.nativeElement.textContent;
    expect(html).toContain('#123');
    expect(html).toContain('299.80');
    expect(html).toContain('Bs');
    expect(html).toContain('PENDIENTE');
  });

  it('sin client_secret no configura Stripe', async () => {
    await setup({ intencion: { ...INTENCION, client_secret: null } });

    expect(componente.listoParaPagar()).toBe(false);
    expect(componente.error()).toBeTruthy();
    expect(stripeClientMock.cargarStripe).not.toHaveBeenCalled();
  });

  it('con publishable key faltante muestra un error de configuración', async () => {
    await setup({
      claveConfigurada: false,
      cargarStripe: () => Promise.reject(new Error('sin key')),
    });

    expect(componente.error()?.toLowerCase()).toContain('no está configurado');
  });

  it('confirmPayment usa redirect if_required y return_url con venta_id', async () => {
    await setup();

    await componente.pagar();

    expect(stripeFake.stripe.confirmPayment).toHaveBeenCalledTimes(1);
    const opciones = stripeFake.stripe.confirmPayment.mock.calls[0]?.[0] as {
      redirect: string;
      elements: unknown;
      confirmParams: { return_url: string };
    };
    expect(opciones.redirect).toBe('if_required');
    expect(opciones.elements).toBe(stripeFake.elements);
    expect(opciones.confirmParams.return_url).toContain('/pagos/stripe/123');
    expect(opciones.confirmParams.return_url).toContain('retorno=stripe');
  });

  it('bloquea el doble submit', async () => {
    await setup();
    let resolver!: (valor: unknown | PromiseLike<unknown>) => void;
    stripeFake.stripe.confirmPayment.mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve;
      }),
    );

    const primera = componente.pagar();
    const segunda = componente.pagar();

    expect(stripeFake.stripe.confirmPayment).toHaveBeenCalledTimes(1);
    expect(componente.confirmandoStripe()).toBe(true);

    resolver({ paymentIntent: { status: 'succeeded' } });
    await primera;
    await segunda;
  });

  it('un error de Stripe.js se muestra y NO inicia polling de éxito', async () => {
    await setup({
      confirmResult: { error: { message: 'Tu tarjeta fue rechazada.' } },
    });

    await componente.pagar();

    expect(componente.error()).toContain('rechazada');
    expect(componente.confirmandoStripe()).toBe(false);
    expect(componente.pagoAprobado()).toBe(false);
    expect(pagoServiceMock.consultarEstado).not.toHaveBeenCalled();
  });

  it('APROBADO del backend muestra Compra completada', async () => {
    await setup({ consultar: () => of(ESTADO_APROBADO) });

    await componente.pagar();
    fixture.detectChanges();

    expect(pagoServiceMock.consultarEstado).toHaveBeenCalledWith(123);
    expect(componente.pagoAprobado()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Compra completada');
  });

  it('RECHAZADO muestra pago rechazado y venta pendiente', async () => {
    await setup({ consultar: () => of(ESTADO_RECHAZADO) });

    await componente.pagar();
    fixture.detectChanges();

    expect(componente.pagoRechazado()).toBe(true);
    expect(componente.pagoAprobado()).toBe(false);
    expect(fixture.nativeElement.textContent?.toLowerCase()).toContain(
      'rechazado',
    );
    expect(componente.mensajeEstado()?.toLowerCase()).toContain('pendiente');
  });

  it('ANULADO permite reintentar sin mostrar éxito', async () => {
    await setup({ consultar: () => of(ESTADO_ANULADO) });

    await componente.pagar();
    fixture.detectChanges();

    expect(componente.pagoRechazado()).toBe(true);
    expect(componente.pagoAprobado()).toBe(false);
    expect(componente.mensajeEstado()?.toLowerCase()).toContain('anulado');
  });

  it('PENDIENTE mantiene la espera del webhook sin éxito prematuro', async () => {
    const estados = new Subject<unknown>();
    await setup({ consultar: () => estados.asObservable() });

    await componente.pagar();
    estados.next(ESTADO_PENDIENTE);

    expect(componente.esperandoWebhook()).toBe(true);
    expect(componente.pagoAprobado()).toBe(false);
    expect(componente.pagoRechazado()).toBe(false);
  });

  it('el polling se detiene en el primer estado terminal', async () => {
    let llamadas = 0;
    await setup({
      consultar: () => {
        llamadas += 1;
        return of(ESTADO_APROBADO);
      },
    });

    await componente.pagar();

    expect(llamadas).toBe(1);
    expect(componente.pagoAprobado()).toBe(true);
  });

  it('al agotar los intentos muestra timeout, no un rechazo falso', async () => {
    await setup({ consultar: () => of(ESTADO_PENDIENTE) });

    vi.useFakeTimers();
    await componente.pagar();
    await vi.advanceTimersByTimeAsync(1500 * 25);
    vi.useRealTimers();

    expect(componente.pagoAprobado()).toBe(false);
    expect(componente.pagoRechazado()).toBe(false);
    expect(componente.pendienteConsulta()).toBe(true);
    expect(componente.mensajeEstado()?.toLowerCase()).toContain(
      'confirmación',
    );
  });

  it('401 al crear la intención cierra la sesión', async () => {
    await setup({
      intencionError: new HttpErrorResponse({ status: 401 }),
    });

    expect(cerrarSesionSpy).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(
      ['/login'],
      expect.objectContaining({ queryParams: expect.anything() }),
    );
  });

  it('403/404/409 al crear la intención muestran un mensaje seguro', async () => {
    await setup({
      intencionError: new HttpErrorResponse({ status: 403 }),
    });
    expect(componente.intencion()).toBeNull();
    expect(componente.error()).toBeTruthy();
    expect(componente.error()).not.toMatch(/select|sql|traceback/i);

    TestBed.resetTestingModule();
    await setup({
      intencionError: new HttpErrorResponse({ status: 404 }),
    });
    expect(componente.error()).toBeTruthy();

    TestBed.resetTestingModule();
    await setup({
      intencionError: new HttpErrorResponse({ status: 409 }),
    });
    expect(componente.error()).toBeTruthy();
  });

  it('un 401 durante el polling cierra la sesión', async () => {
    await setup({
      consultar: () => throwError(() => new HttpErrorResponse({ status: 401 })),
    });

    await componente.pagar();

    expect(cerrarSesionSpy).toHaveBeenCalled();
  });

  it('reintentar tras RECHAZADO crea una nueva intención sin crear venta', async () => {
    await setup({ consultar: () => of(ESTADO_RECHAZADO) });

    await componente.pagar();
    expect(componente.pagoRechazado()).toBe(true);
    expect(pagoServiceMock.crearIntencion).toHaveBeenCalledTimes(1);

    componente.reintentar();
    await fixture.whenStable();

    expect(pagoServiceMock.crearIntencion).toHaveBeenCalledTimes(2);
    expect(componente.pagoRechazado()).toBe(false);
    expect(stripeFake.paymentElement.destroy).toHaveBeenCalled();
  });

  it('no persiste el client_secret en sessionStorage ni localStorage', async () => {
    await setup();

    const contiene = (storage: Storage): boolean => {
      for (let i = 0; i < storage.length; i += 1) {
        const clave = storage.key(i);
        if (clave && (storage.getItem(clave) ?? '').includes('pi_3TestABC')) {
          return true;
        }
      }
      return false;
    };

    expect(contiene(sessionStorage)).toBe(false);
    expect(contiene(localStorage)).toBe(false);
  });

  it('con ?retorno=stripe consulta el estado sin volver a crear venta', async () => {
    await setup({
      query: { retorno: 'stripe' },
      consultar: () => of(ESTADO_PENDIENTE),
    });

    expect(pagoServiceMock.consultarEstado).toHaveBeenCalledWith(123);
    expect(componente.esperandoWebhook()).toBe(true);
  });

  it('CANCELADA + APROBADO muestra Reembolso en proceso sin CTA de pago', async () => {
    await setup({ consultar: () => of(ESTADO_CANCELADA_APROBADO) });

    await componente.pagar();
    fixture.detectChanges();

    expect(componente.reembolsoEnProceso()).toBe(true);
    expect(componente.pagoAprobado()).toBe(false);
    expect(componente.pagoRechazado()).toBe(false);
    const html: string = fixture.nativeElement.textContent;
    expect(html).toContain('Reembolso en proceso');
    expect(html).toContain('No se te volverá a cobrar esta venta');
    expect(html).toContain('RECONSULTAR ESTADO');
    expect(html).not.toContain('PAGAR');
    expect(html).not.toContain('INTENTAR NUEVAMENTE');
  });

  it('CANCELADA + REEMBOLSADO muestra Pago reembolsado sin CTA de pago', async () => {
    await setup({ consultar: () => of(ESTADO_CANCELADA_REEMBOLSADO) });

    await componente.pagar();
    fixture.detectChanges();

    expect(componente.reembolsado()).toBe(true);
    expect(componente.reembolsoEnProceso()).toBe(false);
    expect(componente.pagoAprobado()).toBe(false);
    const html: string = fixture.nativeElement.textContent;
    expect(html).toContain('Pago reembolsado');
    expect(html).toContain('El pago fue devuelto correctamente');
    expect(html).toContain('Volver al catálogo');
    expect(html).not.toContain('PAGAR');
    expect(html).not.toContain('RECONSULTAR ESTADO');
  });

  it('reconsultar un reembolso en proceso NO crea otra intención', async () => {
    let llamadasEstado = 0;
    await setup({
      consultar: () => {
        llamadasEstado += 1;
        return of(ESTADO_CANCELADA_APROBADO);
      },
    });

    await componente.pagar();
    fixture.detectChanges();
    expect(componente.reembolsoEnProceso()).toBe(true);
    expect(pagoServiceMock.crearIntencion).toHaveBeenCalledTimes(1);

    componente.consultarEstado();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(llamadasEstado).toBeGreaterThanOrEqual(2);
    expect(pagoServiceMock.crearIntencion).toHaveBeenCalledTimes(1);
    expect(componente.reembolsoEnProceso()).toBe(true);
  });

  it('el polling termina en CANCELADA + REEMBOLSADO', async () => {
    let llamadas = 0;
    await setup({
      consultar: () => {
        llamadas += 1;
        return of(
          llamadas === 1 ? ESTADO_PENDIENTE : ESTADO_CANCELADA_REEMBOLSADO,
        );
      },
    });

    vi.useFakeTimers();
    await componente.pagar();
    await vi.advanceTimersByTimeAsync(1500 * 3);
    vi.useRealTimers();
    fixture.detectChanges();

    expect(llamadas).toBe(2);
    expect(componente.reembolsado()).toBe(true);
    expect(componente.pagoAprobado()).toBe(false);
    expect(componente.pendienteConsulta()).toBe(false);
  });

  it('una venta CANCELADA no permite reintentar el cobro', async () => {
    await setup({ consultar: () => of(ESTADO_CANCELADA_APROBADO) });

    await componente.pagar();
    fixture.detectChanges();

    expect(componente.ventaCancelada()).toBe(true);
    expect(componente.puedeReintentar()).toBe(false);
    expect(pagoServiceMock.crearIntencion).toHaveBeenCalledTimes(1);

    componente.reintentar();
    await fixture.whenStable();

    expect(pagoServiceMock.crearIntencion).toHaveBeenCalledTimes(1);
  });
});
