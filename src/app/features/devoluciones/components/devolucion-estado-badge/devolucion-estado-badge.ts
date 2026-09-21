import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { etiquetaEstadoDevolucion } from '../../models/devolucion.model';

/**
 * Badge del estado de una devolución (CU25).
 *
 * Siempre muestra el texto del estado además del color (accesibilidad): el
 * color no es la única señal. Estados reales: SOLICITADA, APROBADA, RECHAZADA
 * y COMPLETADA.
 */
@Component({
  selector: 'app-devolucion-estado-badge',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './devolucion-estado-badge.css',
  templateUrl: './devolucion-estado-badge.html',
})
export class DevolucionEstadoBadge {
  readonly estado = input.required<string>();

  readonly clave = computed(() =>
    (this.estado() ?? '').trim().toLowerCase(),
  );

  readonly etiqueta = computed(() => etiquetaEstadoDevolucion(this.estado()));
}
