import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { AdminIcon } from '../../../administracion/components/admin-icon/admin-icon';
import type { IconoAdmin } from '../../../administracion/models/admin-nav-item';

export type TonoKpi = 'acento' | 'exito' | 'info' | 'alerta' | 'neutro';

/**
 * Tarjeta KPI de CU28.
 *
 * Presentacional: recibe valores YA calculados por el backend (nunca
 * recalcula). El `contexto` reemplaza a cualquier comparación inventada.
 */
@Component({
  selector: 'app-reporte-kpi',
  imports: [AdminIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './reporte-kpi.css',
  templateUrl: './reporte-kpi.html',
})
export class ReporteKpi {
  readonly label = input.required<string>();
  /** Acepta `null` porque `DecimalPipe` puede devolverlo con datos vacíos. */
  readonly valor = input.required<string | null>();
  readonly contexto = input<string | null>(null);
  readonly icono = input<IconoAdmin>('reportes');
  readonly tono = input<TonoKpi>('acento');
  /** Aclaración corta para métricas que pueden confundir (ticket, %...). */
  readonly ayuda = input<string | null>(null);
}
