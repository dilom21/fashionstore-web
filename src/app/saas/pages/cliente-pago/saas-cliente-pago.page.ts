import { DecimalPipe, isPlatformBrowser } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  PLATFORM_ID,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import type { Stripe, StripeElements, StripePaymentElement } from '@stripe/stripe-js';

import { StripeClientService } from '../../../core/services/stripe-client.service';
import { AdminIcon } from '../../../features/administracion/components/admin-icon/admin-icon';
import { EstadoPagoClienteTenant, IntencionPagoClienteTenant } from '../../models/cliente-tenant.models';
import { SaasClienteService } from '../../services/saas-cliente.service';
import { SaasErrorService } from '../../services/saas-error.service';
import { generarOperacionId } from '../../utils/operacion-id.util';

const INTERVALO_CONSULTA = 1500;
const MAX_CONSULTAS = 20;

@Component({
  selector: 'app-saas-cliente-pago-page',
  imports: [AdminIcon, DecimalPipe],
  templateUrl: './saas-cliente-pago.page.html',
  styleUrl: './saas-cliente-pago.page.css',
})
export class SaasClientePagoPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(SaasClienteService);
  private readonly errores = inject(SaasErrorService);
  private readonly stripeClient = inject(StripeClientService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  readonly contenedor = viewChild<ElementRef<HTMLDivElement>>('paymentElement');
  readonly ventaId = signal<number | null>(null);
  readonly intencion = signal<IntencionPagoClienteTenant | null>(null);
  readonly estado = signal<EstadoPagoClienteTenant | null>(null);
  readonly cargando = signal(true);
  readonly confirmando = signal(false);
  readonly esperando = signal(false);
  readonly listo = signal(false);
  readonly error = signal<string | null>(null);

  private stripe: Stripe | null = null;
  private elements: StripeElements | null = null;
  private elemento: StripePaymentElement | null = null;
  private consultas = 0;
  private temporizador: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const nodo = this.contenedor()?.nativeElement;
      if (nodo && this.elements && !this.elemento) {
        this.elemento = this.elements.create('payment');
        this.elemento.mount(nodo);
        this.listo.set(true);
      }
    });
    this.destroyRef.onDestroy(() => {
      if (this.temporizador) clearTimeout(this.temporizador);
      this.elemento?.destroy();
    });
  }

  ngOnInit(): void {
    const ventaId = Number(this.route.snapshot.paramMap.get('venta_id'));
    if (!Number.isInteger(ventaId) || ventaId <= 0) {
      this.cargando.set(false);
      this.error.set('La venta indicada no es válida.');
      return;
    }
    this.ventaId.set(ventaId);
    if (!isPlatformBrowser(this.platformId)) return;
    this.iniciar(ventaId);
  }

  private iniciar(ventaId: number): void {
    this.api
      .crearIntencion(ventaId, generarOperacionId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: async (intencion) => {
          this.intencion.set(intencion);
          if (!intencion.client_secret) {
            this.cargando.set(false);
            this.error.set('La pasarela no devolvió una sesión de pago válida.');
            return;
          }
          try {
            this.stripe = await this.stripeClient.cargarStripe();
            this.elements = this.stripe.elements({ clientSecret: intencion.client_secret });
            this.cargando.set(false);
          } catch {
            this.cargando.set(false);
            this.error.set('No se pudo inicializar Stripe en este navegador.');
          }
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          this.error.set(this.errores.normalizar(error, 'cliente/pago').mensaje);
        },
      });
  }

  async pagar(): Promise<void> {
    if (!this.stripe || !this.elements || !this.listo() || this.confirmando()) return;
    this.confirmando.set(true);
    this.error.set(null);
    const resultado = await this.stripe.confirmPayment({
      elements: this.elements,
      redirect: 'if_required',
      confirmParams: { return_url: window.location.href },
    });
    this.confirmando.set(false);
    if (resultado.error) {
      this.error.set(resultado.error.message ?? 'Stripe no pudo confirmar el pago.');
      return;
    }
    this.esperando.set(true);
    this.consultas = 0;
    this.consultarEstado();
  }

  consultarEstado(): void {
    const ventaId = this.ventaId();
    if (ventaId === null) return;
    this.api
      .consultarPago(ventaId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (estado) => {
          this.estado.set(estado);
          const pago = (estado.estado_pago ?? '').toUpperCase();
          const venta = estado.estado_venta.toUpperCase();
          if (pago === 'APROBADO' && (venta === 'COMPLETADA' || venta === 'PAGADA')) {
            this.esperando.set(false);
            return;
          }
          if (['RECHAZADO', 'ANULADO', 'REEMBOLSADO'].includes(pago)) {
            this.esperando.set(false);
            return;
          }
          this.consultas += 1;
          if (this.consultas >= MAX_CONSULTAS) {
            this.esperando.set(false);
            this.error.set('El pago sigue pendiente. Puedes volver a consultar sin repetir el cobro.');
            return;
          }
          this.temporizador = setTimeout(() => this.consultarEstado(), INTERVALO_CONSULTA);
        },
        error: (error: unknown) => {
          this.esperando.set(false);
          this.error.set(this.errores.normalizar(error, 'cliente/pago-estado').mensaje);
        },
      });
  }

  volver(): void {
    void this.router.navigateByUrl('/saas/cliente');
  }
}
