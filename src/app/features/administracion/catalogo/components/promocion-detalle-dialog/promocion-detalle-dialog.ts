import { Component, input, output } from '@angular/core';

import { Promocion } from '../../models/promocion.model';
import {
  VigenciaPromocion,
  calcularVigencia,
  claseVigencia,
  formatearFechaHora,
  formatearValorDescuento,
} from '../../utils/promociones.util';

/**
 * Diálogo de solo lectura con el detalle de una promoción (CU10).
 *
 * Presentacional: recibe la promoción (obtenida por la página desde
 * GET /promociones/{id}) y emite `cerrado`. La vigencia es solo visual.
 */
@Component({
  selector: 'app-promocion-detalle-dialog',
  imports: [],
  styleUrl: './promocion-detalle-dialog.css',
  templateUrl: './promocion-detalle-dialog.html',
})
export class PromocionDetalleDialog {
  readonly promocion = input.required<Promocion>();

  readonly cerrado = output<void>();

  vigencia(): VigenciaPromocion {
    return calcularVigencia(this.promocion());
  }

  claseVigencia(): string {
    return claseVigencia(this.vigencia());
  }

  valor(): string {
    const promocion = this.promocion();
    return formatearValorDescuento(
      promocion.tipo_descuento,
      promocion.valor_descuento,
    );
  }

  formatearFecha(valor: string): string {
    return formatearFechaHora(valor);
  }

  cerrar(): void {
    this.cerrado.emit();
  }
}
