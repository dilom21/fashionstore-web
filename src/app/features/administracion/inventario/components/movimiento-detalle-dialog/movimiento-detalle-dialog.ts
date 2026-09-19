import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { MovimientoInventarioItem } from '../../models/movimiento-inventario.model';
import { MovimientoBadge } from '../movimiento-badge/movimiento-badge';

/**
 * Diálogo de detalle (SOLO LECTURA) de un movimiento de inventario (CU14).
 *
 * Componente presentacional: se abre de forma discreta desde el kardex cuando
 * el movimiento tiene observaciones. Emite `cerrado` al cerrarse.
 */
@Component({
  selector: 'app-movimiento-detalle-dialog',
  imports: [DatePipe, MovimientoBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './movimiento-detalle-dialog.css',
  templateUrl: './movimiento-detalle-dialog.html',
})
export class MovimientoDetalleDialog {
  readonly movimiento = input.required<MovimientoInventarioItem>();

  /** Origen ya humanizado (p. ej. "Orden compra #15") o "—". */
  readonly origen = input<string>('—');

  readonly cerrado = output<void>();

  cerrar(): void {
    this.cerrado.emit();
  }
}
