import type { DatasetGrafico } from '../components/reporte-chart/reporte-chart';
import type { FilaRanking } from '../components/reporte-ranking/reporte-ranking';
import {
  ConteoEstado,
  SucursalComparada,
} from '../models/dashboard.model';
import { SerieTemporal } from '../models/reportes-common.model';
import { PALETA_GRAFICAS, colorPorIndice } from './reportes.util';

/** Métrica seleccionable en las gráficas (las tres existen en el backend). */
export type MetricaGrafica = 'MONTO' | 'CANTIDAD' | 'UNIDADES';

export interface DatosGrafica {
  etiquetas: string[];
  datasets: DatasetGrafico[];
}

/** Valor real de un punto de evolución según la métrica elegida. */
export function valorMetrica(
  punto: SerieTemporal,
  metrica: MetricaGrafica,
): number {
  if (metrica === 'MONTO') {
    return Number(punto.monto ?? 0);
  }
  if (metrica === 'UNIDADES') {
    return Number(punto.unidades ?? 0);
  }
  return Number(punto.cantidad ?? 0);
}

/** Evolución temporal (línea/área) con una sola serie. */
export function evolucion(
  serie: SerieTemporal[],
  metrica: MetricaGrafica,
  etiqueta = 'Serie',
): DatosGrafica {
  return {
    etiquetas: (serie ?? []).map((punto) => punto.periodo),
    datasets: [
      {
        label: etiqueta,
        data: (serie ?? []).map((punto) => valorMetrica(punto, metrica)),
      },
    ],
  };
}

/** Serie numérica de filas con etiqueta y métricas genéricas. */
export function barras<T extends { etiqueta: string }>(
  filas: T[],
  metrica: MetricaGrafica,
  campos: { cantidad: keyof T; monto?: keyof T; unidades?: keyof T },
  etiquetaSerie = 'Total',
  colores?: string[],
): DatosGrafica {
  const lista = filas ?? [];
  return {
    etiquetas: lista.map((fila) => fila.etiqueta),
    datasets: [
      {
        label: etiquetaSerie,
        data: lista.map((fila) => {
          if (metrica === 'MONTO' && campos.monto !== undefined) {
            return Number(fila[campos.monto] ?? 0);
          }
          if (metrica === 'UNIDADES' && campos.unidades !== undefined) {
            return Number(fila[campos.unidades] ?? 0);
          }
          return Number(fila[campos.cantidad] ?? 0);
        }),
        colores,
      },
    ],
  };
}

/** Donut de estados/canales con `ConteoEstado` real. */
export function donutConteo(filas: ConteoEstado[]): DatosGrafica {
  const lista = filas ?? [];
  return {
    etiquetas: lista.map((fila) => fila.estado),
    datasets: [
      {
        label: 'Cantidad',
        data: lista.map((fila) => Number(fila.cantidad)),
        colores: lista.map((_, indice) => colorPorIndice(indice)),
      },
    ],
  };
}

/** Donut genérico (canales, métodos, pasarelas, carritos...). */
export function donut<T>(
  filas: T[],
  etiquetaDe: (fila: T) => string,
  cantidadDe: (fila: T) => number,
  etiquetaSerie = 'Cantidad',
): DatosGrafica {
  const lista = filas ?? [];
  return {
    etiquetas: lista.map(etiquetaDe),
    datasets: [
      {
        label: etiquetaSerie,
        data: lista.map((fila) => Number(cantidadDe(fila) ?? 0)),
        colores: lista.map((_, indice) => colorPorIndice(indice)),
      },
    ],
  };
}

/** Ranking visual (barras horizontales) desde filas reales. */
export function rankingFilas<T>(
  filas: T[],
  etiquetaDe: (fila: T) => string,
  unidadesDe: (fila: T) => number,
  montoDe?: (fila: T) => number,
): FilaRanking[] {
  return (filas ?? []).map((fila) => ({
    etiqueta: etiquetaDe(fila),
    unidades: Number(unidadesDe(fila) ?? 0),
    monto: montoDe === undefined ? null : Number(montoDe(fila) ?? 0),
  }));
}

/**
 * Ranking desde una fila con etiqueta (`EtiquetaRanking`, `MontoFila`...).
 *
 * Sirve para categorías, tallas, colores, temporadas y colecciones: usa las
 * unidades como valor de barra y conserva el monto real.
 */
export function rankingMontoFila(
  filas: { etiqueta: string; unidades?: number | null; monto?: number | null }[],
): FilaRanking[] {
  return (filas ?? []).map((fila) => ({
    etiqueta: fila.etiqueta,
    unidades: Number(fila.unidades ?? 0),
    monto: Number(fila.monto ?? 0),
  }));
}

/** Comparativo de sucursales (solo ADMINISTRADOR). */
export function comparativoSucursales(
  sucursales: SucursalComparada[],
  metrica: 'MONTO' | 'UNIDADES',
): DatosGrafica {
  const lista = sucursales ?? [];
  return {
    etiquetas: lista.map((sucursal) => sucursal.sucursal_nombre),
    datasets: [
      {
        label: metrica === 'MONTO' ? 'Monto vendido' : 'Unidades',
        data: lista.map((sucursal) =>
          metrica === 'MONTO'
            ? Number(sucursal.monto_vendido ?? 0)
            : Number(sucursal.unidades ?? 0),
        ),
        colores: [PALETA_GRAFICAS[2]],
      },
    ],
  };
}

/** Paleta por defecto expuesta para etiquetas propias. */
export const PALETA = PALETA_GRAFICAS;
