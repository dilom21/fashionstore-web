/**
 * Modelos comunes de CU28 - Reportes.
 *
 * Nombres EXACTOS de `app/modules/reportes/schemas/common.py`:
 * los `Decimal` llegan como número|string y se normalizan a `number` en el
 * servicio (solo presentación). Las fechas son `date` (YYYY-MM-DD) en los
 * filtros y `datetime` ISO en las respuestas.
 */

/** Tipos reales de `TIPOS_REPORTE` (mismo valor para el tab y la exportación). */
export type TipoReporte =
  | 'RESUMEN'
  | 'VENTAS'
  | 'PRODUCTOS'
  | 'INVENTARIO'
  | 'RESERVAS'
  | 'DEVOLUCIONES'
  | 'PAGOS'
  | 'COMPRAS_PROVEEDORES'
  | 'CLIENTES_CARRITOS'
  | 'AUDITORIA';

export type FormatoExportacion = 'PDF' | 'XLSX' | 'CSV';
export type AgrupacionReporte = 'DIA' | 'MES';

export const AGRUPACIONES: readonly AgrupacionReporte[] = ['DIA', 'MES'];
export const FORMATOS_EXPORTACION: readonly FormatoExportacion[] = [
  'PDF',
  'XLSX',
  'CSV',
];

/** Opciones de `top` admitidas por el backend (1..50; UI: 5/10/20). */
export const TOP_OPCIONES: readonly number[] = [5, 10, 20];
export const TAMANO_PAGINA_REPORTES = 20;
export const UMBRAL_STOCK_BAJO_POR_DEFECTO = 5;

/** Rango efectivo aplicado (`PeriodoReporteResponse`). */
export interface PeriodoReporte {
  fecha_desde: string | null;
  fecha_hasta: string | null;
}

/** Alcance real: global (ADMIN) o sucursal concreta (`AlcanceReporteResponse`). */
export interface AlcanceReporte {
  es_global: boolean;
  sucursal_id: number | null;
  sucursal_nombre: string | null;
}

/** `PaginacionResponse`. */
export interface PaginacionReporte {
  pagina: number;
  tamano_pagina: number;
  total_registros: number;
  total_paginas: number;
}

/** Cabecera común de todos los reportes (`MetadatosReporteResponse`). */
export interface MetadatosReporte {
  tipo: string;
  periodo: PeriodoReporte;
  alcance: AlcanceReporte;
  generado_en: string;
}

/** Punto de evolución agrupada en SQL (`SerieTemporalResponse`). */
export interface SerieTemporal {
  periodo: string;
  cantidad: number;
  monto: number | null;
  unidades: number | null;
}

/** Fila genérica de ranking/agrupación (`MontoFilaResponse`). */
export interface MontoFila {
  etiqueta: string;
  cantidad: number;
  unidades: number | null;
  monto: number | null;
}

/**
 * Filtros globales soportados por CU28.
 *
 * `sucursal_id` solo lo usa ADMINISTRADOR; ENCARGADO_SUCURSAL no puede ampliar
 * alcance (el backend responde 403).
 */
export interface ReportesFiltros {
  fecha_desde?: string | null;
  fecha_hasta?: string | null;
  sucursal_id?: number | null;
  agrupacion?: AgrupacionReporte;
  top?: number;
  umbral_stock_bajo?: number;
  pagina?: number;
  tamano_pagina?: number;
}

/** Accesos rápidos de período (solo rellenan fechas y consultan). */
export type RangoRapido = 'HOY' | 'SIETE_DIAS' | 'MES_ACTUAL' | 'ANIO_ACTUAL';

export const RANGOS_RAPIDOS: readonly { id: RangoRapido; label: string }[] = [
  { id: 'HOY', label: 'Hoy' },
  { id: 'SIETE_DIAS', label: '7 días' },
  { id: 'MES_ACTUAL', label: 'Este mes' },
  { id: 'ANIO_ACTUAL', label: 'Este año' },
];
