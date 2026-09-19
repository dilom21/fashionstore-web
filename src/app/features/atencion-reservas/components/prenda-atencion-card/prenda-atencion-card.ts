import { Component, input, output } from '@angular/core';

import { AdminIcon } from '../../../administracion/components/admin-icon/admin-icon';
import { AtencionReservaItem } from '../../models/atencion-reserva.model';

/**
 * Tarjeta presentacional de una prenda reservada durante la atención (CU18).
 *
 * No guarda estado propio: el padre es dueño de `seleccionada` y `cantidad`
 * (estado SOLO local del frontend, nunca persistido automáticamente).
 *
 * Reglas de UI de los controles:
 * - "-" resta mientras cantidad > 1 (para llegar a 0 hay que desmarcar).
 * - "+" suma mientras cantidad < cantidad_reservada.
 * - Con la prenda desmarcada o la atención finalizada, ambos quedan inactivos.
 */
@Component({
  selector: 'app-prenda-atencion-card',
  imports: [AdminIcon],
  styleUrl: './prenda-atencion-card.css',
  templateUrl: './prenda-atencion-card.html',
})
export class PrendaAtencionCard {
  readonly prenda = input.required<AtencionReservaItem>();
  readonly seleccionada = input(true);
  readonly cantidad = input(0);
  /** true cuando la atención ya terminó: vista de solo lectura. */
  readonly bloqueada = input(false);

  /** El empleado marcó/desmarcó la prenda. */
  readonly seleccionCambiada = output<boolean>();
  /** El empleado cambió la cantidad a comprar. */
  readonly cantidadCambiada = output<number>();

  puedeRestar(): boolean {
    return !this.bloqueada() && this.seleccionada() && this.cantidad() > 1;
  }

  puedeSumar(): boolean {
    return (
      !this.bloqueada() &&
      this.seleccionada() &&
      this.cantidad() < this.prenda().cantidad_reservada
    );
  }

  alternar(): void {
    if (this.bloqueada()) {
      return;
    }
    this.seleccionCambiada.emit(!this.seleccionada());
  }

  restar(): void {
    if (!this.puedeRestar()) {
      return;
    }
    this.cantidadCambiada.emit(this.cantidad() - 1);
  }

  sumar(): void {
    if (!this.puedeSumar()) {
      return;
    }
    this.cantidadCambiada.emit(this.cantidad() + 1);
  }
}
