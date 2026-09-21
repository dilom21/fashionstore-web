import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { formatearMonto } from '../../../ventas/models/comprobante-venta.model';

/** Fila del ranking (etiqueta + unidades + monto opcional). */
export interface FilaRanking {
  etiqueta: string;
  unidades: number;
  monto?: number | null;
}

export type FormatoRanking = 'UNIDADES' | 'MONTO';

/**
 * Ranking con barras horizontales (CU28).
 *
 * Es la alternativa visual a una tabla: se usa para top de productos, tallas,
 * colores, motivos de devolución, etc. Las barras son proporcionales al valor
 * real de la fila (no se recalculan totales).
 */
@Component({
  selector: 'app-reporte-ranking',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './reporte-ranking.css',
  templateUrl: './reporte-ranking.html',
})
export class ReporteRanking {
  readonly filas = input.required<FilaRanking[]>();
  readonly formato = input<FormatoRanking>('UNIDADES');
  readonly sufijo = input<string | null>(null);
  /** Límite visual de filas (el backend ya entrega el `top` solicitado). */
  readonly maximo = input(10);

  /** Valor usado para la barra según el formato elegido. */
  readonly visibles = computed(() =>
    this.filas().slice(0, this.maximo()).map((fila, indice) => ({
      ...fila,
      indice: indice + 1,
      valor: this.valor(fila),
    })),
  );

  /** Máximo de la lista visible: escala real, sin inventar totales. */
  readonly maximoValor = computed(() => {
    const valores = this.visibles().map((fila) => fila.valor);
    return valores.length === 0 ? 0 : Math.max(...valores);
  });

  readonly hayDatos = computed(() => this.visibles().length > 0);

  porcentaje(valor: number): number {
    const maximo = this.maximoValor();
    return maximo <= 0 ? 0 : Math.round((valor / maximo) * 100);
  }

  /** Etiqueta del valor mostrado a la derecha de la barra. */
  texto(fila: FilaRanking): string {
    if (this.formato() === 'MONTO') {
      return `Bs ${formatearMonto(fila.monto ?? 0)}`;
    }
    const sufijo = this.sufijo();
    return sufijo === null
      ? String(fila.unidades)
      : `${fila.unidades} ${sufijo}`;
  }

  private valor(fila: FilaRanking): number {
    return this.formato() === 'MONTO'
      ? Number(fila.monto ?? 0)
      : Number(fila.unidades ?? 0);
  }
}
