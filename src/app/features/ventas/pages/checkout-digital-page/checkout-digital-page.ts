import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ToastService } from '../../../../core/services/toast.service';
import { SAAS_MODE } from '../../../../core/config/app-mode';
import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import { TenantApiService } from '../../../saas/services/tenant-api.service';
import {
  CarritoDetalle,
  CarritoItem,
} from '../../../carrito/models/carrito.model';
import { CarritoService } from '../../../carrito/services/carrito.service';
import { Navbar } from '../../../home/components/navbar/navbar';
import {
  ESTADO_VENTA_PENDIENTE,
  esVentaConfirmada,
  normalizarEstado,
} from '../../models/pago-electronico.model';
import { VentaDigitalResponse } from '../../models/venta-digital.model';
import { PagoElectronicoService } from '../../services/pago-electronico.service';
import { VentaDigitalService } from '../../services/venta-digital.service';
import {
  guardarVentaPendiente,
  limpiarVentaPendiente,
  obtenerVentaPendiente,
} from '../../utils/checkout-pendiente.storage';
import { traducirErrorVentaDigital } from '../../utils/venta-digital-error.util';

/**
 * Checkout de compra digital (CU19) - /checkout/:carrito_id.
 *
 * Revisa el carrito ACTIVO y, tras una confirmación explícita, lo convierte en
 * una venta PENDIENTE (POST /ventas/digital con canal 'WEB'). NO procesa pagos:
 * Stripe pertenece a CU22.
 *
 * El carrito es de solo lectura aquí: las cantidades se editan en CU15. Los
 * importes provienen del backend; el frontend no recalcula ni decide stock.
 */
@Component({
  selector: 'app-checkout-digital-page',
  imports: [Navbar, RouterLink, DatePipe, DecimalPipe],
  styleUrl: './checkout-digital-page.css',
  templateUrl: './checkout-digital-page.html',
})
export class CheckoutDigitalPage implements OnInit {
  private readonly carritoService = inject(CarritoService);
  private readonly ventaDigitalService = inject(VentaDigitalService);
  private readonly pagoService = inject(PagoElectronicoService);
  private readonly authService = inject(AuthService);
  private readonly tenantApi = inject(TenantApiService);
  private readonly saasMode = inject(SAAS_MODE);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly carritoId = signal<number | null>(null);
  readonly carrito = signal<CarritoDetalle | null>(null);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly volverAlCarrito = signal(false);
  readonly procesando = signal(false);
  readonly ventaCreada = signal<VentaDigitalResponse | null>(null);

  readonly items = computed<CarritoItem[]>(() => this.carrito()?.items ?? []);
  readonly unidades = computed(
    () => this.carrito()?.cantidad_total_unidades ?? 0,
  );
  readonly total = computed(() => this.carrito()?.subtotal_carrito ?? 0);

  /** Error de carga del carrito (solo mientras no hay carrito). */
  readonly errorCarga = computed(() =>
    this.carrito() === null ? this.error() : null,
  );

  readonly puedeConfirmar = computed(
    () =>
      this.carrito() !== null &&
      this.ventaCreada() === null &&
      !this.procesando() &&
      !this.cargando(),
  );

  /** Estado visual de la venta. `PENDIENTE` es un resultado correcto. */
  readonly estadoVenta = computed(() => {
    const estado = (this.ventaCreada()?.estado ?? '').trim().toUpperCase();
    return estado === 'PENDIENTE' ? 'PENDIENTE DE PAGO' : estado;
  });

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('carrito_id'));
    if (!Number.isInteger(id) || id <= 0) {
      this.error.set('El carrito solicitado no es válido.');
      return;
    }
    this.carritoId.set(id);
    this.cargarCarrito(id);
  }

  cargarCarrito(carritoId: number): void {
    this.cargando.set(true);
    this.error.set(null);
    this.carritoService
      .obtenerCarrito(carritoId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detalle) => {
          if (!this.carritoService.estaActivo(detalle)) {
            // El carrito pudo convertirse en venta en una visita anterior
            // (p. ej. el cliente recargó el checkout). Antes de perder la
            // navegación, se intenta retomar esa venta con el backend.
            if (this.recuperarCheckoutPendiente(carritoId)) {
              return;
            }
            this.cargando.set(false);
            this.irAlListadoDeCarritos(
              'Este carrito ya no está disponible para comprar.',
            );
            return;
          }
          this.cargando.set(false);
          this.carrito.set(detalle);
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          this.carrito.set(null);
          this.manejarError(error);
        },
      });
  }

  /**
   * Confirma la compra digital. Se ejecuta una sola vez: el guard `procesando`
   * evita el doble submit aunque el backend también sea idempotente.
   */
  confirmarCompra(): void {
    const carritoId = this.carritoId();
    if (!this.puedeConfirmar() || carritoId === null) {
      return;
    }

    this.error.set(null);
    this.volverAlCarrito.set(false);
    this.procesando.set(true);

    this.ventaDigitalService
      .realizarCompra(carritoId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (venta) => {
          this.procesando.set(false);
          this.ventaCreada.set(venta);
          // Pista (no autorización) para poder retomar este checkout si el
          // cliente recarga la página antes de pagar.
          guardarVentaPendiente(carritoId, venta.venta_id);
          // El backend ya marcó el carrito como CONVERTIDO: se refresca el badge
          // y NO se vuelve a consultar el carrito convertido.
          this.carritoService.refrescarContador();
          this.toast.mostrar('Compra preparada correctamente.', 'ok');
        },
        error: (error: unknown) => {
          this.procesando.set(false);
          const traducido = traducirErrorVentaDigital(error);
          if (traducido.sesionExpirada) {
            this.cerrarSesion();
            return;
          }
          // Si otra pestaña ya convirtió el carrito, se retoma la venta
          // conocida (siempre verificada contra el backend) en lugar de
          // dejarla inaccesible.
          if (traducido.yaPreparada) {
            if (this.recuperarCheckoutPendiente(carritoId)) {
              return;
            }
          }
          this.volverAlCarrito.set(traducido.volverAlCarrito);
          this.error.set(traducido.mensaje);
        },
      });
  }

  volverAlCarritoActual(): void {
    const carritoId = this.carritoId();
    if (carritoId !== null) {
      void this.router.navigate(['/carritos', carritoId]);
    } else {
      void this.router.navigate(['/carritos']);
    }
  }

  /**
   * CU22: continúa al pago electrónico reutilizando el `venta_id` ya creado.
   * NO vuelve a crear la venta ni llama a Stripe desde el checkout.
   */
  continuarAlPago(): void {
    const venta = this.ventaCreada();
    if (venta === null) {
      return;
    }
    void this.router.navigate(['/pagos/stripe', venta.venta_id]);
  }

  irAlCatalogo(): void {
    void this.router.navigate(['/catalogo']);
  }

  irAMisCarritos(): void {
    void this.router.navigate(['/carritos']);
  }

  /**
   * Recupera un checkout interrumpido por una recarga.
   *
   * La venta guardada en el navegador es SOLO una pista: antes de navegar se
   * consulta su estado real con `GET /pagos/stripe/ventas/{id}/estado`, que
   * valida la propiedad desde el JWT. Un `venta_id` manipulado, de otro cliente
   * o inexistente nunca permite continuar.
   *
   * @returns true si se inició la verificación (la navegación la decide la
   *          respuesta del backend); false si no hay venta que recuperar.
   */
  private recuperarCheckoutPendiente(carritoId: number): boolean {
    const ventaId = obtenerVentaPendiente(carritoId);
    if (ventaId === null) {
      return false;
    }

    this.cargando.set(true);
    this.error.set(null);
    this.pagoService
      .consultarEstado(ventaId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (estado) => {
          this.cargando.set(false);
          this.continuarVentaVerificada(
            carritoId,
            ventaId,
            estado.estado_venta,
          );
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          this.manejarErrorRecuperacion(carritoId, error);
        },
      });
    return true;
  }

  /** Decide el destino según el estado real confirmado por el backend. */
  private continuarVentaVerificada(
    carritoId: number,
    ventaId: number,
    estadoVenta: string | null | undefined,
  ): void {
    const estado = normalizarEstado(estadoVenta);

    // Pago ya procesado: el resultado correcto es el comprobante (CU23).
    if (esVentaConfirmada(estado)) {
      limpiarVentaPendiente(carritoId);
      this.toast.mostrar('Tu compra ya fue completada.', 'ok');
      void this.router.navigate(['/ventas', ventaId, 'comprobante']);
      return;
    }

    // Venta aún PENDIENTE: se retoma el pago sin crear otra venta ni otra
    // intención (la página de pago reutiliza la intención existente).
    if (estado === ESTADO_VENTA_PENDIENTE) {
      this.toast.mostrar('Retomamos tu compra pendiente.', 'info');
      void this.router.navigate(['/pagos/stripe', ventaId]);
      return;
    }

    // CANCELADA u otro estado no reanudable: no se ofrece pagar de nuevo.
    limpiarVentaPendiente(carritoId);
    this.volverAlCarrito.set(false);
    this.error.set('Tu compra ya no está disponible para continuar.');
  }

  /** Errores al verificar la venta recordada (nunca se confía en la pista). */
  private manejarErrorRecuperacion(
    carritoId: number,
    error: unknown,
  ): void {
    const status = error instanceof HttpErrorResponse ? error.status : -1;

    if (status === 401) {
      this.cerrarSesion();
      return;
    }

    if (status === 403 || status === 404) {
      // La venta no existe o no pertenece al cliente autenticado.
      limpiarVentaPendiente(carritoId);
      this.irAlListadoDeCarritos(
        'No encontramos una compra pendiente asociada a tu cuenta.',
      );
      return;
    }

    // Red o servidor: se conserva la pista para reintentar al recargar.
    this.volverAlCarrito.set(false);
    this.error.set(
      'No pudimos verificar tu compra pendiente. Recarga la página para reintentar.',
    );
  }

  private manejarError(error: unknown): void {
    const traducido = traducirErrorVentaDigital(error);
    if (traducido.sesionExpirada) {
      this.cerrarSesion();
      return;
    }
    if (traducido.volverAlCarrito) {
      this.irAlListadoDeCarritos(traducido.mensaje);
      return;
    }
    this.error.set(traducido.mensaje);
  }

  private irAlListadoDeCarritos(mensaje: string): void {
    this.toast.mostrar(mensaje, 'info');
    void this.router.navigate(['/carritos']);
  }

  private cerrarSesion(): void {
    if (this.saasMode) {
      this.tenantApi.cerrarSesion();
    } else {
      this.authService.cerrarSesion();
    }
    this.carritoService.limpiar();
    void this.router.navigate(['/login'], {
      queryParams: { returnUrl: this.router.url },
    });
  }
}
