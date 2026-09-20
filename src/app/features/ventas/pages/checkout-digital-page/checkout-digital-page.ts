import { DatePipe, DecimalPipe } from '@angular/common';
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
import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import {
  CarritoDetalle,
  CarritoItem,
} from '../../../carrito/models/carrito.model';
import { CarritoService } from '../../../carrito/services/carrito.service';
import { Navbar } from '../../../home/components/navbar/navbar';
import { VentaDigitalResponse } from '../../models/venta-digital.model';
import { VentaDigitalService } from '../../services/venta-digital.service';
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
  private readonly authService = inject(AuthService);
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
          this.cargando.set(false);
          if (!this.carritoService.estaActivo(detalle)) {
            this.irAlListadoDeCarritos(
              'Este carrito ya no está disponible para comprar.',
            );
            return;
          }
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
    this.authService.cerrarSesion();
    this.carritoService.limpiar();
    void this.router.navigate(['/login'], {
      queryParams: { returnUrl: this.router.url },
    });
  }
}
