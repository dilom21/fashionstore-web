import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';

import { AuthService } from '../../../../autenticacion-seguridad/auth/services/auth.service';
import { DetalleOrdenCompra, OrdenCompra } from '../../models/orden-compra.model';
import { OrdenesCompraService } from '../../services/ordenes-compra.service';
import { traducirErrorOrdenesCompra } from '../../utils/ordenes-compra-error.util';
import {
  calcularSubtotal,
  calcularTotal,
  etiquetaEstado as etiquetaEstadoOrden,
  formatearFecha as formatearFechaTexto,
  formatearMoneda as formatearMonedaTexto,
} from '../../utils/ordenes-compra.util';

/**
 * Diálogo de consulta (Ver) de una orden de compra (CU12).
 *
 * Muestra la cabecera completa y, mediante GET /ordenes-compra/{id}/detalles,
 * las líneas con su subtotal y el total económico calculado. Es solo lectura:
 * el total es visual y no se persiste.
 */
@Component({
  selector: 'app-orden-compra-detalle-dialog',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './orden-compra-detalle-dialog.css',
  templateUrl: './orden-compra-detalle-dialog.html',
})
export class OrdenCompraDetalleDialog {
  readonly orden = input.required<OrdenCompra>();

  readonly cerrado = output<void>();

  private readonly ordenesService = inject(OrdenesCompraService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly detalles = signal<DetalleOrdenCompra[]>([]);

  readonly total = computed(() => calcularTotal(this.detalles()));

  ngOnInit(): void {
    this.cargarDetalles();
  }

  etiquetaEstado(estado: OrdenCompra['estado']): string {
    return etiquetaEstadoOrden(estado);
  }

  formatearFecha(valor: string | null): string {
    return formatearFechaTexto(valor);
  }

  subtotal(detalle: DetalleOrdenCompra): number {
    return calcularSubtotal(detalle.cantidad, detalle.costo_unitario);
  }

  formatearMoneda(valor: number): string {
    return formatearMonedaTexto(valor);
  }

  cerrar(): void {
    this.cerrado.emit();
  }

  private cargarDetalles(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.ordenesService
      .listarDetalles(this.orden().id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          this.cargando.set(false);
          this.detalles.set(respuesta.detalles);
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          const traducido = traducirErrorOrdenesCompra(error);
          if (traducido.sesionExpirada) {
            this.authService.cerrarSesion();
            void this.router.navigateByUrl('/auth/personal/login');
            return;
          }
          this.error.set(traducido.mensaje);
        },
      });
  }
}
