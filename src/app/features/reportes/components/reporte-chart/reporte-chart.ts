import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import type { Chart, ChartConfiguration, ChartItem } from 'chart.js';

import { COLOR_GRID, COLOR_TEXTO, PALETA_GRAFICAS } from '../../utils/reportes.util';

export type TipoGrafico = 'line' | 'bar' | 'doughnut';
export type FormatoValorGrafico = 'MONTO' | 'NUMERO' | 'PORCENTAJE';

/** Serie a dibujar (colores opcionales; si faltan se usa la paleta). */
export interface DatasetGrafico {
  label: string;
  data: number[];
  colores?: string[];
}

/**
 * Gráfica de CU28 basada en Chart.js.
 *
 * - `chart.js` se importa de forma DINÁMICA dentro de un camino solo-navegador
 *   (tras `afterNextRender`): SSR y `npm run build` no lo ejecutan.
 * - La instancia se crea UNA vez y solo se actualizan datos/opciones (no se
 *   recrea en cada cambio de filtros).
 * - Se destruye en `ngOnDestroy` para no dejar canvas colgados.
 */
@Component({
  selector: 'app-reporte-chart',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './reporte-chart.css',
  templateUrl: './reporte-chart.html',
})
export class ReporteChart implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);

  readonly tipo = input<TipoGrafico>('line');
  readonly etiquetas = input.required<string[]>();
  readonly datasets = input.required<DatasetGrafico[]>();
  readonly horizontal = input(false);
  readonly altura = input(260);
  readonly mostrarLeyenda = input(true);
  readonly formato = input<FormatoValorGrafico>('NUMERO');
  readonly descripcion = input('Gráfica del reporte');

  private readonly lienzo = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private grafico: Chart | null = null;
  private tipoCreado: TipoGrafico | null = null;
  private creando = false;
  private destruido = false;

  readonly tieneDatos = computed(() =>
    this.datasets().some((serie) => serie.data.some((valor) => valor !== 0)),
  );

  constructor() {
    // 1) Primer intento en el navegador, cuando el canvas ya está en el DOM.
    afterNextRender(() => void this.sincronizar());

    // 2) Cualquier cambio de datos/opciones re-sincroniza: crea el chart si aún
    //    no existe (los datos llegan por HTTP después del primer render) o
    //    actualiza la MISMA instancia.
    effect(() => {
      this.etiquetas();
      this.datasets();
      this.tipo();
      this.horizontal();
      this.mostrarLeyenda();
      this.formato();
      void this.sincronizar();
    });
  }

  ngOnDestroy(): void {
    this.destruido = true;
    this.grafico?.destroy();
    this.grafico = null;
    this.tipoCreado = null;
  }

  /**
   * Crea el chart la primera vez y después solo refresca datos/opciones.
   *
   * En SSR nunca se toca el canvas; en el navegador SÍ se inicializa (tras el
   * primer render o cuando llegan los datasets), sin instancias superpuestas.
   */
  private async sincronizar(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || this.destruido) {
      return;
    }
    const elemento = this.lienzo()?.nativeElement;
    if (elemento === undefined) {
      return;
    }
    if (this.grafico !== null && this.tipoCreado === this.tipo()) {
      this.actualizar();
      return;
    }
    await this.crear(elemento);
  }

  /** Una única instancia por canvas (se recrea solo si cambia el tipo). */
  private async crear(elemento: HTMLCanvasElement): Promise<void> {
    if (this.creando) {
      return;
    }
    this.creando = true;
    try {
      // `chart.js/auto` registra controllers, scales, elements y plugins:
      // la entrada `chart.js` NO lo hace y fallaría con "not a registered
      // controller".
      const { Chart: ChartJs } = await import('chart.js/auto');
      if (this.destruido) {
        return;
      }
      this.grafico?.destroy();
      this.grafico = new ChartJs(elemento as ChartItem, this.configuracion());
      this.tipoCreado = this.tipo();
    } catch (error) {
      console.error('[reporte-chart] No se pudo crear la gráfica', error);
      this.grafico = null;
      this.tipoCreado = null;
    } finally {
      this.creando = false;
    }
  }

  /** Refresca la instancia existente con los datasets vigentes. */
  private actualizar(): void {
    if (this.grafico === null) {
      return;
    }
    const configuracion = this.configuracion();
    this.grafico.data = configuracion.data as never;
    this.grafico.options = configuracion.options as never;
    this.grafico.update();
  }

  /** Configuración visual (identidad VANTER MEN, fondo transparente). */
  private configuracion(): ChartConfiguration {
    const series = this.datasets();
    const color = (serie: DatasetGrafico, indice: number): string =>
      serie.colores?.[0] ?? PALETA_GRAFICAS[indice % PALETA_GRAFICAS.length];

    return {
      type: this.tipo(),
      data: {
        labels: this.etiquetas(),
        datasets: series.map((serie, indice) => {
          const base = color(serie, indice);
          if (this.tipo() === 'doughnut') {
            return {
              label: serie.label,
              data: serie.data,
              backgroundColor: serie.colores ?? [...PALETA_GRAFICAS],
              borderColor: 'rgba(9, 12, 22, 0.92)',
              borderWidth: 2,
            };
          }
          return {
            label: serie.label,
            data: serie.data,
            borderColor: base,
            backgroundColor: this.tipo() === 'line' ? `${base}33` : `${base}cc`,
            fill: this.tipo() === 'line',
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 2,
            pointHoverRadius: 5,
            pointBackgroundColor: base,
            borderRadius: this.tipo() === 'bar' ? 6 : 0,
          };
        }),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: this.horizontal() && this.tipo() === 'bar' ? 'y' : 'x',
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: this.mostrarLeyenda(),
            labels: {
              color: COLOR_TEXTO,
              boxWidth: 12,
              boxHeight: 12,
              usePointStyle: true,
              font: { size: 11, weight: 600 },
            },
          },
          tooltip: {
            backgroundColor: 'rgba(11, 17, 32, 0.96)',
            borderColor: 'rgba(168, 85, 247, 0.35)',
            borderWidth: 1,
            titleColor: '#f8fafc',
            bodyColor: '#cbd5f5',
            padding: 10,
            displayColors: this.tipo() === 'doughnut',
            callbacks: {
              label: (contexto) =>
                ` ${contexto.dataset.label}: ${this.formatear(
                  contexto.parsed as unknown as number | { x: number; y: number },
                )}`,
            },
          },
        },
        scales:
          this.tipo() === 'doughnut'
            ? {}
            : {
                x: {
                  grid: { color: COLOR_GRID, drawTicks: false },
                  border: { display: false },
                  ticks: { color: COLOR_TEXTO, font: { size: 10 } },
                },
                y: {
                  beginAtZero: true,
                  grid: { color: COLOR_GRID, drawTicks: false },
                  border: { display: false },
                  ticks: {
                    color: COLOR_TEXTO,
                    font: { size: 10 },
                    callback: (valor) => this.formatear(Number(valor)),
                  },
                },
              },
      },
    };
  }

  /** Tooltips/ejes legibles con el formato del reporte. */
  private formatear(
    valor: number | { x: number; y: number } | null,
  ): string {
    const numero =
      valor === null
        ? 0
        : typeof valor === 'number'
          ? valor
          : (valor.y ?? valor.x ?? 0);

    if (this.formato() === 'MONTO') {
      return `Bs ${numero.toFixed(2)}`;
    }
    if (this.formato() === 'PORCENTAJE') {
      return `${numero.toFixed(1)} %`;
    }
    return String(Math.round(numero));
  }
}
