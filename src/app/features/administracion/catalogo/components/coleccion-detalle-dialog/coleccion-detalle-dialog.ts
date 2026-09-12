import { Component, input, output } from '@angular/core';

import { ColeccionDetalle } from '../../models/coleccion.model';

/**
 * Diálogo de solo lectura con el detalle de una colección (CU08).
 *
 * Recibe el `ColeccionDetalle` obtenido con GET /colecciones/{id}, que incluye
 * la temporada resumida y el total de productos asignados.
 */
@Component({
  selector: 'app-coleccion-detalle-dialog',
  imports: [],
  styleUrl: './coleccion-detalle-dialog.css',
  templateUrl: './coleccion-detalle-dialog.html',
})
export class ColeccionDetalleDialog {
  readonly coleccion = input.required<ColeccionDetalle>();

  readonly cerrado = output<void>();

  cerrar(): void {
    this.cerrado.emit();
  }
}
