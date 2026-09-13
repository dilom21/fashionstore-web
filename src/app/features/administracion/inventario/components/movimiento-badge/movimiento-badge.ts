import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { TipoMovimientoInventario } from '../../models/movimiento-inventario.model';

/** Clase visual semántica del badge (tono + icono por tipo de movimiento). */
type ClaseMovimiento =
  | 'entrada'
  | 'salida'
  | 'reserva'
  | 'liberacion'
  | 'devolucion';

/** Etiqueta legible de cada tipo de movimiento del kardex. */
const ETIQUETAS: Record<TipoMovimientoInventario, string> = {
  ENTRADA_COMPRA: 'Entrada por compra',
  SALIDA_VENTA: 'Salida por venta',
  RESERVA: 'Reserva',
  LIBERACION_RESERVA: 'Liberación de reserva',
  DEVOLUCION: 'Devolución',
};

/** Clase visual (color) de cada tipo de movimiento. */
const CLASES: Record<TipoMovimientoInventario, ClaseMovimiento> = {
  ENTRADA_COMPRA: 'entrada',
  SALIDA_VENTA: 'salida',
  RESERVA: 'reserva',
  LIBERACION_RESERVA: 'liberacion',
  DEVOLUCION: 'devolucion',
};

/**
 * Badge semántico de un movimiento de inventario (CU14).
 *
 * No depende solo del color: combina icono + texto + tono para que el
 * movimiento siga siendo identificable con baja visión o daltonismo.
 */
@Component({
  selector: 'app-movimiento-badge',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './movimiento-badge.css',
  templateUrl: './movimiento-badge.html',
})
export class MovimientoBadge {
  readonly tipo = input.required<TipoMovimientoInventario>();

  readonly etiqueta = computed(() => ETIQUETAS[this.tipo()]);
  readonly clase = computed(() => CLASES[this.tipo()]);
}
