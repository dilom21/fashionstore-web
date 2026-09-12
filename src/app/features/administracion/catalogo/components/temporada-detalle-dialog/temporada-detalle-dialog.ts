import { Component, input, output } from '@angular/core';

import { Temporada } from '../../models/temporada.model';

/**
 * Diálogo de solo lectura con el detalle de una temporada (CU08).
 *
 * Presentacional: recibe la temporada y emite `cerrado`. El dato ya fue
 * obtenido por la página desde GET /temporadas o POST/PATCH.
 */
@Component({
  selector: 'app-temporada-detalle-dialog',
  imports: [],
  styleUrl: './temporada-detalle-dialog.css',
  templateUrl: './temporada-detalle-dialog.html',
})
export class TemporadaDetalleDialog {
  readonly temporada = input.required<Temporada>();

  readonly cerrado = output<void>();

  formatearFecha(fecha: string): string {
    if (!fecha || fecha.length < 10) {
      return fecha;
    }
    const [anio, mes, dia] = fecha.slice(0, 10).split('-');
    return `${dia}/${mes}/${anio}`;
  }

  cerrar(): void {
    this.cerrado.emit();
  }
}
