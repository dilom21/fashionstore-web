/**
 * Modelos de datos del dominio Movimientos de Inventario (CU14).
 *
 * Kardex de SOLO LECTURA. Los nombres de propiedad coinciden exactamente con
 * el JSON real que expone el backend FastAPI (GET /movimientos-inventario).
 * No se convierten a camelCase para mantener compatibilidad directa con la API.
 */

/** Tipos de movimiento admitidos por el backend (enum TipoMovimiento). */
export type TipoMovimientoInventario =
  | 'ENTRADA_COMPRA'
  | 'SALIDA_VENTA'
  | 'RESERVA'
  | 'LIBERACION_RESERVA'
  | 'DEVOLUCION';

/** Fila del kardex tal como la devuelve GET /movimientos-inventario. */
export interface MovimientoInventarioItem {
  movimiento_id: number;
  inventario_id: number;

  usuario_id: number | null;
  usuario_correo: string | null;

  tipo: TipoMovimientoInventario;
  cantidad: number;
  fecha_hora: string;
  observaciones: string | null;

  referencia_tipo: string | null;
  referencia_id: number | null;

  sucursal_id: number;
  sucursal_nombre: string;

  producto_id: number;
  producto_nombre: string;

  variante_producto_id: number;
  sku: string;

  talla_id: number;
  talla_nombre: string;

  color_id: number;
  color_nombre: string;

  temporada_id: number;
  temporada_nombre: string;
}

/** Respuesta paginada de GET /movimientos-inventario. */
export interface MovimientoInventarioConsultaResponse {
  items: MovimientoInventarioItem[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Filtros opcionales admitidos por GET /movimientos-inventario.
 *
 * Solo se envían los que tengan valor. Para ENCARGADO_SUCURSAL no se envía
 * `sucursal_id`: el backend aplica su alcance automáticamente.
 *
 * `referencia_tipo` es texto libre en la API (sin enum): las opciones de la UI
 * se construyen a partir de los valores reales observados en las respuestas.
 */
export interface MovimientoInventarioConsultaFiltros {
  sucursal_id?: number;
  tipo?: TipoMovimientoInventario;
  producto?: string;
  producto_id?: number;
  variante_producto_id?: number;
  temporada_id?: number;
  usuario_id?: number;
  referencia_tipo?: string;
  fecha_desde?: string;
  fecha_hasta?: string;
  limit?: number;
  offset?: number;
}
