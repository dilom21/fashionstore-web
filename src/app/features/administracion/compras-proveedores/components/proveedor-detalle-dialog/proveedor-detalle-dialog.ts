import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ProveedorDetalle } from '../../models/proveedor.model';

/**
 * Diálogo de consulta (Ver) de un proveedor (CU11).
 *
 * Componente presentacional de solo lectura: muestra los datos completos del
 * proveedor, incluido el total de productos asociados, y emite `cerrado` al
 * cerrarse. Los campos opcionales nulos se muestran como "—".
 */
@Component({
  selector: 'app-proveedor-detalle-dialog',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './proveedor-detalle-dialog.css',
  templateUrl: './proveedor-detalle-dialog.html',
})
export class ProveedorDetalleDialog {
  readonly proveedor = input.required<ProveedorDetalle>();

  readonly cerrado = output<void>();

  cerrar(): void {
    this.cerrado.emit();
  }
}
