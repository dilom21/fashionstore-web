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
import { ConfirmDialog } from '../../../../shared/components/confirm-dialog/confirm-dialog';
import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import { Navbar } from '../../../home/components/navbar/navbar';
import { CarritoDetalle, CarritoItem } from '../../models/carrito.model';
import { CarritoService } from '../../services/carrito.service';
import { SucursalCompraService } from '../../services/sucursal-compra.service';
import { traducirErrorCarrito } from '../../utils/carrito-error.util';

/**
 * Detalle del carrito (CU15) - /carritos/:carrito_id.
 *
 * Muestra las líneas de UNA sucursal. Cada línea es una variante concreta: la
 * misma prenda en talla/color distintos son filas independientes (lo decide el
 * backend).
 *
 * Los importes SIEMPRE provienen de la respuesta del backend; el frontend no
 * recalcula subtotales ni decide stock/expiraciones.
 * CU15 NO implementa checkout: "Ir a pagar" solo avisa que estará disponible.
 */
@Component({
  selector: 'app-carrito-detalle-page',
  imports: [Navbar, RouterLink, DatePipe, DecimalPipe, ConfirmDialog],
  styleUrl: './carrito-detalle-page.css',
  templateUrl: './carrito-detalle-page.html',
})
export class CarritoDetallePage implements OnInit {
  private readonly carritoService = inject(CarritoService);
  private readonly sucursalCompra = inject(SucursalCompraService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly carritoId = signal<number | null>(null);
  readonly detalle = signal<CarritoDetalle | null>(null);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  /** detalle_id cuya cantidad se está actualizando (bloquea sus botones). */
  readonly procesandoDetalleId = signal<number | null>(null);
  readonly pendienteEliminarLinea = signal<CarritoItem | null>(null);
  readonly eliminandoLinea = signal(false);

  readonly items = computed<CarritoItem[]>(() => this.detalle()?.items ?? []);
  readonly unidades = computed(
    () => this.detalle()?.cantidad_total_unidades ?? 0,
  );
  readonly subtotal = computed(() => this.detalle()?.subtotal_carrito ?? 0);

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('carrito_id'));
    if (!Number.isInteger(id) || id <= 0) {
      this.error.set('El carrito solicitado no es válido.');
      return;
    }
    this.carritoId.set(id);
    this.cargar(id);
  }

  cargar(carritoId: number): void {
    this.cargando.set(true);
    this.error.set(null);
    this.carritoService
      .obtenerCarrito(carritoId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detalle) => {
          this.cargando.set(false);
          this.aplicarDetalle(detalle);
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          this.detalle.set(null);
          this.manejarError(error);
        },
      });
  }

  aumentar(item: CarritoItem): void {
    this.cambiarCantidad(item, item.cantidad + 1);
  }

  /** Con cantidad 1, el botón "-" pide confirmación para eliminar la línea. */
  disminuir(item: CarritoItem): void {
    if (item.cantidad > 1) {
      this.cambiarCantidad(item, item.cantidad - 1);
      return;
    }
    this.pendienteEliminarLinea.set(item);
  }

  solicitarEliminar(item: CarritoItem): void {
    if (this.eliminandoLinea()) {
      return;
    }
    this.pendienteEliminarLinea.set(item);
  }

  cancelarEliminar(): void {
    this.pendienteEliminarLinea.set(null);
  }

  confirmarEliminar(): void {
    const pendiente = this.pendienteEliminarLinea();
    this.pendienteEliminarLinea.set(null);
    const carritoId = this.carritoId();
    if (pendiente === null || carritoId === null) {
      return;
    }

    this.eliminandoLinea.set(true);
    this.carritoService
      .eliminarDetalle(carritoId, pendiente.detalle_id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detalle) => {
          this.eliminandoLinea.set(false);
          const seguiaActivo = this.carritoService.estaActivo(detalle);
          this.aplicarDetalle(detalle);
          if (seguiaActivo) {
            this.toast.mostrar('Producto eliminado del carrito.', 'ok');
          }
        },
        error: (error: unknown) => {
          this.eliminandoLinea.set(false);
          const traducido = traducirErrorCarrito(error);
          if (traducido.sesionExpirada) {
            this.cerrarSesion();
            return;
          }
          this.toast.mostrar(traducido.mensaje, 'error');
        },
      });
  }

  /** Vuelve al catálogo conservando la sucursal de este carrito. */
  buscarMasProductos(): void {
    const detalle = this.detalle();
    if (detalle !== null) {
      this.sucursalCompra.seleccionar(
        detalle.sucursal_id,
        detalle.sucursal_nombre,
      );
    }
    void this.router.navigate(['/catalogo']);
  }

  /** CU19: lleva al checkout para confirmar la compra digital. */
  irAPagar(): void {
    const carritoId = this.carritoId();
    if (carritoId === null) {
      return;
    }
    void this.router.navigate(['/checkout', carritoId]);
  }

  reintentar(): void {
    const carritoId = this.carritoId();
    if (carritoId !== null) {
      this.cargar(carritoId);
    }
  }

  bloqueado(item: CarritoItem): boolean {
    return (
      this.procesandoDetalleId() === item.detalle_id || this.eliminandoLinea()
    );
  }

  private cambiarCantidad(item: CarritoItem, cantidad: number): void {
    const carritoId = this.carritoId();
    if (carritoId === null || cantidad < 1) {
      return;
    }
    this.procesandoDetalleId.set(item.detalle_id);
    this.carritoService
      .actualizarCantidad(carritoId, item.detalle_id, cantidad)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detalle) => {
          this.procesandoDetalleId.set(null);
          this.aplicarDetalle(detalle);
        },
        error: (error: unknown) => {
          this.procesandoDetalleId.set(null);
          const traducido = traducirErrorCarrito(error);
          if (traducido.sesionExpirada) {
            this.cerrarSesion();
            return;
          }
          // Sin actualización optimista: la vista conserva la cantidad anterior.
          this.toast.mostrar(traducido.mensaje, 'error');
        },
      });
  }

  /**
   * Aplica la respuesta del backend. Si el carrito dejó de estar ACTIVO (última
   * línea eliminada o carrito eliminado), sale del detalle.
   */
  private aplicarDetalle(detalle: CarritoDetalle): void {
    if (!this.carritoService.estaActivo(detalle)) {
      this.toast.mostrar(
        'Carrito eliminado porque ya no contiene productos.',
        'info',
      );
      this.carritoService.refrescarContador();
      void this.router.navigate(['/carritos']);
      return;
    }
    this.detalle.set(detalle);
    this.sucursalCompra.seleccionar(
      detalle.sucursal_id,
      detalle.sucursal_nombre,
    );
  }

  private manejarError(error: unknown): void {
    const traducido = traducirErrorCarrito(error);
    if (traducido.sesionExpirada) {
      this.cerrarSesion();
      return;
    }
    if (error instanceof HttpErrorResponse && error.status === 404) {
      this.toast.mostrar('Este carrito ya no está disponible.', 'info');
      void this.router.navigate(['/carritos']);
      return;
    }
    this.error.set(traducido.mensaje);
  }

  private cerrarSesion(): void {
    this.authService.cerrarSesion();
    this.carritoService.limpiar();
    void this.router.navigate(['/login'], {
      queryParams: { returnUrl: this.router.url },
    });
  }
}
