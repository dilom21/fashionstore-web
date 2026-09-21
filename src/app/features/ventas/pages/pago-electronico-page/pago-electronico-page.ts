import { DecimalPipe, isPlatformBrowser } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type {
  PaymentIntentResult,
  Stripe,
  StripeElements,
  StripePaymentElement,
} from '@stripe/stripe-js';

import { StripeClientService } from '../../../../core/services/stripe-client.service';
import { ToastService } from '../../../../core/services/toast.service';
import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import { Navbar } from '../../../home/components/navbar/navbar';
import {
  ESTADO_VENTA_CANCELADA,
  EstadoPagoVentaResponse,
  EstadoVisualPago,
  IntencionPagoResponse,
  etiquetaMoneda,
  mapearEstadoVisualPago,
  normalizarEstado,
  permiteReintentarPago,
} from '../../models/pago-electronico.model';
import { PagoElectronicoService } from '../../services/pago-electronico.service';
import { traducirErrorPagoElectronico } from '../../utils/pago-electronico-error.util';

/** Intervalo entre consultas al backend durante la espera del webhook. */
const INTERVALO_POLLING_MS = 1500;

/** Máximo de consultas antes de declarar timeout (sin polling infinito). */
const MAX_INTENTOS_POLLING = 20;

/**
 * CU22 - Procesar pago electrónico con Stripe (ruta /pagos/stripe/:venta_id).
 *
 * Flujo:
 *
 *   venta PENDIENTE (CU19)
 *   -> POST /pagos/stripe/intencion (crea/reutiliza PaymentIntent)
 *   -> Payment Element (Stripe.js, solo navegador)
 *   -> stripe.confirmPayment({ redirect: 'if_required' })
 *   -> el webhook firmado del backend es la ÚNICA autoridad
 *   -> polling a GET /pagos/stripe/ventas/{venta_id}/estado
 *   -> "Compra completada" SOLO con pago APROBADO / venta final
 *
 * Stripe.js NO decide el resultado del negocio. El `client_secret` vive solo en
 * memoria: nunca se persiste ni se loggea. No se crean inputs de tarjeta.
 *
 * SSR: toda la inicialización de Stripe (loadStripe, elements, mount) queda
 * detrás de `isPlatformBrowser`, por lo que el render de servidor no la ejecuta.
 */
@Component({
  selector: 'app-pago-electronico-page',
  imports: [Navbar, RouterLink, DecimalPipe],
  styleUrl: './pago-electronico-page.css',
  templateUrl: './pago-electronico-page.html',
})
export class PagoElectronicoPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly pagoService = inject(PagoElectronicoService);
  private readonly stripeClient = inject(StripeClientService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);

  /** Contenedor del Payment Element (lo monta Stripe.js). */
  readonly paymentElementRef =
    viewChild<ElementRef<HTMLDivElement>>('paymentElement');

  readonly ventaId = signal<number | null>(null);
  readonly intencion = signal<IntencionPagoResponse | null>(null);
  readonly estado = signal<EstadoPagoVentaResponse | null>(null);

  readonly idInvalido = signal(false);
  readonly cargandoIntent = signal(false);
  readonly configurandoStripe = signal(false);
  readonly listoParaPagar = signal(false);
  readonly confirmandoStripe = signal(false);
  readonly esperandoWebhook = signal(false);
  readonly pendienteConsulta = signal(false);
  readonly error = signal<string | null>(null);
  readonly mensajeEstado = signal<string | null>(null);

  /**
   * Interpretación ÚNICA del estado backend. Toda la UI deriva de aquí: nunca
   * se combinan `estado_venta`/`estado_pago` en la plantilla.
   */
  readonly estadoVisual = computed<EstadoVisualPago | null>(() => {
    const estado = this.estado();
    return estado === null ? null : mapearEstadoVisualPago(estado);
  });

  readonly pagoAprobado = computed(() => this.estadoVisual() === 'EXITO');
  readonly pagoRechazado = computed(
    () => this.estadoVisual() === 'RECHAZADO' || this.estadoVisual() === 'ANULADO',
  );
  readonly reembolsoEnProceso = computed(
    () => this.estadoVisual() === 'REEMBOLSO_EN_PROCESO',
  );
  readonly reembolsado = computed(() => this.estadoVisual() === 'REEMBOLSADO');
  readonly estadoDesconocido = computed(
    () => this.estadoVisual() === 'DESCONOCIDO',
  );

  /** Una venta CANCELADA nunca debe volver a cobrarse. */
  readonly ventaCancelada = computed(
    () =>
      normalizarEstado(this.estado()?.estado_venta) === ESTADO_VENTA_CANCELADA,
  );

  /** Solo un rechazo/anulación de una venta no cancelada permite reintentar. */
  readonly puedeReintentar = computed(() => {
    const visual = this.estadoVisual();
    return (
      visual !== null &&
      permiteReintentarPago(visual) &&
      !this.ventaCancelada()
    );
  });

  /** Instancia de Stripe.js y sus Elements (solo en memoria). */
  private stripe: Stripe | null = null;
  private elements: StripeElements | null = null;
  private paymentElement: StripePaymentElement | null = null;

  /** Control del polling (sin temporizadores infinitos). */
  private pollingActivo = false;
  private intentosPolling = 0;
  private temporizador: ReturnType<typeof setTimeout> | null = null;

  readonly monto = computed(() => this.intencion()?.monto ?? 0);
  readonly moneda = computed(() => etiquetaMoneda(this.intencion()?.moneda));

  readonly estadoPago = computed(() =>
    normalizarEstado(
      this.estado()?.estado_pago ?? this.intencion()?.estado_pago ?? 'PENDIENTE',
    ),
  );

  readonly estadoVenta = computed(() =>
    normalizarEstado(this.estado()?.estado_venta ?? 'PENDIENTE'),
  );

  /**
   * Se puede confirmar cuando el Payment Element ya está montado y el backend
   * no reportó un estado terminal (éxito, rechazo, anulación, reembolso o
   * desconocido). Una venta CANCELADA nunca habilita el cobro.
   */
  readonly puedePagar = computed(
    () =>
      this.listoParaPagar() &&
      !this.confirmandoStripe() &&
      !this.esperandoWebhook() &&
      !this.pendienteConsulta() &&
      !this.pagoAprobado() &&
      !this.pagoRechazado() &&
      !this.reembolsoEnProceso() &&
      !this.reembolsado() &&
      !this.estadoDesconocido() &&
      !this.ventaCancelada(),
  );

  /**
   * Permite reconsultar tras un timeout, un error de consulta o mientras el
   * reembolso sigue pendiente. NUNCA crea una nueva intención ni cobra.
   */
  readonly puedeConsultar = computed(
    () =>
      this.pendienteConsulta() ||
      this.reembolsoEnProceso() ||
      this.estadoDesconocido(),
  );

  constructor() {
    // Monta el Payment Element en cuanto el contenedor existe (solo navegador).
    effect(() => {
      const contenedor = this.paymentElementRef()?.nativeElement;
      const elements = this.elements;
      if (
        this.listoParaPagar() &&
        contenedor &&
        elements !== null &&
        this.paymentElement === null
      ) {
        this.montarElemento(elements, contenedor);
      }
    });

    this.destroyRef.onDestroy(() => {
      this.detenerPolling();
      this.destruirElemento();
    });
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('venta_id'));
    if (!Number.isInteger(id) || id <= 0) {
      this.idInvalido.set(true);
      this.error.set('La venta indicada no es válida.');
      return;
    }

    this.ventaId.set(id);
    const retorno = this.route.snapshot.queryParamMap.get('retorno');
    this.iniciar(id, retorno === 'stripe');
  }

  /**
   * Crea/reutiliza la intención y configura Stripe. Nunca se ejecuta en SSR:
   * sin navegador no se toca Stripe.js ni el DOM.
   */
  private iniciar(ventaId: number, retorno: boolean): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.cargandoIntent.set(true);
    this.error.set(null);

    this.pagoService
      .crearIntencion(ventaId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (intencion) => {
          this.cargandoIntent.set(false);
          this.intencion.set(intencion);
          if (!intencion.client_secret) {
            this.error.set(
              'No fue posible iniciar el pago. Intenta nuevamente.',
            );
            return;
          }
          void this.configurarStripe(intencion.client_secret, retorno);
        },
        error: (error: unknown) => {
          this.cargandoIntent.set(false);
          this.manejarError(error);
        },
      });
  }

  /** Carga Stripe.js y prepara Elements con el client_secret (solo browser). */
  private async configurarStripe(
    clientSecret: string,
    retorno: boolean,
  ): Promise<void> {
    this.configurandoStripe.set(true);
    try {
      const stripe = await this.stripeClient.cargarStripe();
      this.stripe = stripe;
      this.elements = stripe.elements({ clientSecret });
      this.configurandoStripe.set(false);
      this.listoParaPagar.set(true);

      if (retorno) {
        // Vuelta de 3DS/redirect: no se confía en el callback; se consulta el
        // backend para conocer el estado real.
        this.esperandoWebhook.set(true);
        this.iniciarPolling();
      }
    } catch {
      this.configurandoStripe.set(false);
      this.error.set(
        this.stripeClient.claveConfigurada
          ? 'No pudimos iniciar el pago con tarjeta. Intenta nuevamente.'
          : 'El pago con tarjeta no está configurado. Contacta al soporte.',
      );
    }
  }

  private montarElemento(
    elements: StripeElements,
    contenedor: HTMLElement,
  ): void {
    if (this.paymentElement !== null) {
      return;
    }
    const elemento = elements.create('payment');
    elemento.mount(contenedor);
    this.paymentElement = elemento;
  }

  /** Confirma el pago con Stripe.js. El backend (webhook) es la autoridad. */
  async pagar(): Promise<void> {
    if (
      !this.puedePagar() ||
      this.stripe === null ||
      this.elements === null
    ) {
      return;
    }

    this.error.set(null);
    this.confirmandoStripe.set(true);

    let resultado: PaymentIntentResult;
    try {
      resultado = await this.stripe.confirmPayment({
        elements: this.elements,
        confirmParams: { return_url: this.construirReturnUrl() },
        redirect: 'if_required',
      });
    } catch {
      this.confirmandoStripe.set(false);
      this.error.set('No pudimos procesar el pago. Intenta nuevamente.');
      return;
    }

    if (resultado.error) {
      // Error inmediato de Stripe.js: NO es un pago aprobado. Se reactiva la UI.
      this.confirmandoStripe.set(false);
      this.error.set(this.mensajeStripe(resultado.error.message));
      return;
    }

    // Aceptada sin redirección: aún no es éxito. Se espera al webhook firmado.
    this.confirmandoStripe.set(false);
    this.pendienteConsulta.set(false);
    this.esperandoWebhook.set(true);
    this.mensajeEstado.set('Confirmando pago...');
    this.iniciarPolling();
  }

  /** Reintenta tras un rechazo/anulación: nueva intención, mismo venta_id. */
  reintentar(): void {
    // Una venta CANCELADA no debe volver a cobrarse jamás.
    if (this.ventaCancelada()) {
      return;
    }
    this.destruirElemento();
    this.intencion.set(null);
    this.estado.set(null);
    this.listoParaPagar.set(false);
    this.esperandoWebhook.set(false);
    this.pendienteConsulta.set(false);
    this.mensajeEstado.set(null);
    this.error.set(null);

    const ventaId = this.ventaId();
    if (ventaId !== null) {
      this.iniciar(ventaId, false);
    }
  }

  /**
   * Vuelve a consultar el estado (tras timeout, error de consulta o mientras el
   * reembolso sigue pendiente). NUNCA crea una intención ni vuelve a cobrar.
   */
  consultarEstado(): void {
    if (
      this.confirmandoStripe() ||
      this.pagoAprobado() ||
      this.reembolsado() ||
      this.pagoRechazado()
    ) {
      return;
    }
    this.error.set(null);
    this.pendienteConsulta.set(false);
    this.mensajeEstado.set(
      this.reembolsoEnProceso()
        ? 'Estamos verificando el estado del reembolso.'
        : 'Confirmando pago...',
    );
    this.esperandoWebhook.set(true);
    this.iniciarPolling();
  }

  // ===== Polling backend (autoridad real) =====

  private iniciarPolling(): void {
    this.detenerPolling();
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this.pollingActivo = true;
    this.intentosPolling = 0;
    this.consultarEstadoUnaVez();
  }

  private consultarEstadoUnaVez(): void {
    const ventaId = this.ventaId();
    if (!this.pollingActivo || ventaId === null) {
      return;
    }

    this.intentosPolling += 1;
    this.pagoService
      .consultarEstado(ventaId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (estado) => {
          if (this.aplicarEstado(estado)) {
            return;
          }
          if (this.intentosPolling >= MAX_INTENTOS_POLLING) {
            this.onTimeout();
            return;
          }
          this.programarConsulta();
        },
        error: (error: unknown) => this.manejarErrorConsulta(error),
      });
  }

  private programarConsulta(): void {
    if (!this.pollingActivo || !isPlatformBrowser(this.platformId)) {
      return;
    }
    this.temporizador = setTimeout(
      () => this.consultarEstadoUnaVez(),
      INTERVALO_POLLING_MS,
    );
  }

  /**
   * Refleja el estado del backend. Devuelve true si es terminal.
   *
   * Un retraso del webhook (PENDIENTE) NUNCA se convierte en rechazo.
   */
  private aplicarEstado(estado: EstadoPagoVentaResponse): boolean {
    this.estado.set(estado);
    const visual = mapearEstadoVisualPago(estado);

    // El webhook sigue en camino: no es un estado terminal.
    if (visual === 'EN_CONFIRMACION') {
      this.esperandoWebhook.set(true);
      this.mensajeEstado.set('El pago está siendo procesado.');
      return false;
    }

    this.detenerPolling();
    this.esperandoWebhook.set(false);
    this.pendienteConsulta.set(false);
    this.error.set(null);

    switch (visual) {
      case 'EXITO':
        this.mensajeEstado.set(null);
        this.toast.mostrar('Pago aprobado. Compra completada.', 'ok');
        break;
      case 'REEMBOLSADO':
        this.mensajeEstado.set('El pago fue devuelto correctamente.');
        break;
      case 'REEMBOLSO_EN_PROCESO':
        this.mensajeEstado.set(
          'Estamos procesando la devolución de tu pago.',
        );
        break;
      case 'RECHAZADO':
        this.mensajeEstado.set('Pago rechazado. La venta sigue pendiente.');
        break;
      case 'ANULADO':
        this.mensajeEstado.set(
          'El pago fue anulado. Puedes intentarlo de nuevo.',
        );
        break;
      default:
        // DESCONOCIDO: estado seguro, nunca habilita un nuevo cobro.
        this.mensajeEstado.set(
          'No pudimos determinar el estado del pago. Puedes reconsultar.',
        );
        break;
    }
    return true;
  }

  private onTimeout(): void {
    this.detenerPolling();
    this.esperandoWebhook.set(false);
    this.pendienteConsulta.set(true);
    this.mensajeEstado.set(
      'El pago sigue en confirmación. Puedes volver a consultar el estado.',
    );
  }

  private manejarErrorConsulta(error: unknown): void {
    const traducido = traducirErrorPagoElectronico(error);
    if (traducido.sesionExpirada) {
      this.cerrarSesion();
      return;
    }
    this.detenerPolling();
    this.esperandoWebhook.set(false);
    this.pendienteConsulta.set(true);
    this.error.set(traducido.mensaje);
  }

  private manejarError(error: unknown): void {
    const traducido = traducirErrorPagoElectronico(error);
    if (traducido.sesionExpirada) {
      this.cerrarSesion();
      return;
    }
    this.error.set(traducido.mensaje);
  }

  private detenerPolling(): void {
    this.pollingActivo = false;
    if (this.temporizador !== null) {
      clearTimeout(this.temporizador);
      this.temporizador = null;
    }
  }

  private destruirElemento(): void {
    this.paymentElement?.destroy();
    this.paymentElement = null;
    this.elements = null;
    this.stripe = null;
  }

  private construirReturnUrl(): string {
    const ventaId = this.ventaId();
    const origen = isPlatformBrowser(this.platformId)
      ? window.location.origin
      : '';
    return `${origen}/pagos/stripe/${ventaId}?retorno=stripe`;
  }

  private mensajeStripe(mensaje: string | undefined): string {
    const texto = (mensaje ?? '').trim();
    return texto.length > 0
      ? texto
      : 'No pudimos procesar el pago. Revisa los datos e intenta nuevamente.';
  }

  /**
   * CU23: abre el comprobante de esta venta ya pagada
   * (/ventas/{venta_id}/comprobante). El usuario decide luego si descarga o
   * imprime: CU23 no dispara nada automáticamente.
   */
  verComprobante(): void {
    const ventaId = this.ventaId();
    if (ventaId === null) {
      return;
    }
    void this.router.navigate(['/ventas', ventaId, 'comprobante']);
  }

  irAlCatalogo(): void {
    void this.router.navigate(['/catalogo']);
  }

  irAMisCarritos(): void {
    void this.router.navigate(['/carritos']);
  }

  private cerrarSesion(): void {
    this.authService.cerrarSesion();
    void this.router.navigate(['/login'], {
      queryParams: { returnUrl: this.router.url },
    });
  }
}
