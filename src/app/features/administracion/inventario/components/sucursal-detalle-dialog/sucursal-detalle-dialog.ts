import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { Sucursal } from '../../models/sucursal.model';

/**
 * Diálogo de consulta (Ver) de una sucursal (CU06).
 *
 * Componente presentacional de solo lectura: muestra los datos completos de la
 * sucursal y emite `cerrado` cuando el usuario lo cierra.
 */
@Component({
  selector: 'app-sucursal-detalle-dialog',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './sucursal-detalle-dialog.css',
  templateUrl: './sucursal-detalle-dialog.html',
})
export class SucursalDetalleDialog {
  readonly sucursal = input.required<Sucursal>();

  readonly cerrado = output<void>();

  cerrar(): void {
    this.cerrado.emit();
  }
}
