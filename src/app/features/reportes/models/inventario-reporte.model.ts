import {
  MetadatosReporte,
  PaginacionReporte,
} from './reportes-common.model';

/**
 * Resumen de inventario (`InventarioResumenResponse`).
 *
 * "Stock bajo" es un criterio de REPORTE: `0 < stock_disponible <= umbral`.
 */
export interface InventarioResumen {
  stock_actual_total: number;
  stock_reservado_total: number;
  stock_disponible_total: number;
  variantes_agotadas: number;
  variantes_stock_bajo: number;
  umbral_stock_bajo: number;
}

/** Movimientos agrupados por tipo real (`InventarioMovimientoTipoResponse`). */
export interface InventarioMovimientoTipo {
  tipo: string;
  cantidad_movimientos: number;
  unidades: number;
}

/** Fila de la tabla paginada (`InventarioTablaItemResponse`). */
export interface InventarioTablaItem {
  inventario_id: number;
  sucursal: string;
  producto: string;
  sku: string;
  talla: string;
  color: string;
  temporada: string;
  stock_actual: number;
  stock_reservado: number;
  stock_disponible: number;
  fecha_actualizacion: string;
}

/** `GET /reportes/inventario` (no acepta `agrupacion`). */
export interface ReporteInventarioResponse {
  metadatos: MetadatosReporte;
  resumen: InventarioResumen;
  movimientos_por_tipo: InventarioMovimientoTipo[];
  paginacion: PaginacionReporte;
  items: InventarioTablaItem[];
}
