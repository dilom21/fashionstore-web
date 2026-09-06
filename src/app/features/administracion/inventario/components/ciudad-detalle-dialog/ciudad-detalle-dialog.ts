import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { Ciudad } from '../../models/ciudad.model';

/**
 * Diálogo de consulta (Ver) de una ciudad (CU06).
 *
 * Componente presentacional de solo lectura: muestra los datos de la ciudad y
 * emite `cerrado` cuando el usuario lo cierra.
 */
@Component({
  selector: 'app-ciudad-detalle-dialog',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './ciudad-detalle-dialog.css',
  templateUrl: './ciudad-detalle-dialog.html',
})
export class CiudadDetalleDialog {
  readonly ciudad = input.required<Ciudad>();

  readonly cerrado = output<void>();

  cerrar(): void {
    this.cerrado.emit();
  }
}
