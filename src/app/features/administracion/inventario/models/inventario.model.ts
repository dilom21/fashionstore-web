/**
 * Modelos de datos del dominio Consulta de Inventario por Sucursal (CU13).
 *
 * Los nombres de propiedad coinciden exactamente con el JSON real que expone
 * el backend FastAPI (GET /inventario). No se convierten a camelCase para
 * mantener compatibilidad directa con la API.
 */

/** Valores admitidos por el filtro `disponibilidad` de GET /inventario. */
export type DisponibilidadInventario =
  | 'TODOS'
  | 'CON_STOCK'
  | 'STOCK_BAJO'
  | 'SIN_STOCK';

/** Fila de inventario tal como la devuelve GET /inventario en `items[]`. */
export interface InventarioItem {
  inventario_id: number;

  sucursal_id: number;
  sucursal_nombre: string;

  producto_id: number;
  producto_nombre: string;
  precio: string | number;

  categoria_id: number;
  categoria_nombre: string;

  variante_producto_id: number;
  sku: string;

  talla_id: number;
  talla_nombre: string;

  color_id: number;
  color_nombre: string;

  temporada_id: number;
  temporada_nombre: string;

  stock_actual: number;
  stock_reservado: number;
  stock_disponible: number;

  fecha_actualizacion: string;
}

/** Respuesta paginada de GET /inventario. */
export interface InventarioConsultaResponse {
  items: InventarioItem[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Filtros opcionales admitidos por GET /inventario.
 *
 * Solo se envían al backend los que tengan valor. Para ENCARGADO_SUCURSAL no
 * se envía `sucursal_id`: el backend aplica su alcance automáticamente.
 */
export interface InventarioConsultaFiltros {
  sucursal_id?: number;
  producto?: string;
  producto_id?: number;
  categoria_id?: number;
  talla_id?: number;
  color_id?: number;
  temporada_id?: number;
  disponibilidad?: DisponibilidadInventario;
  limit?: number;
  offset?: number;
}
