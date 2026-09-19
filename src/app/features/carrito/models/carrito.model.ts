/**
 * Modelos del dominio Carrito de compras (CU15).
 *
 * Los nombres coinciden con el JSON real del backend FastAPI
 * (POST /carritos/items, GET /carritos, GET /carritos/{id},
 * PATCH/DELETE /carritos/{id}/items/{detalle_id}, DELETE /carritos/{id}).
 *
 * El backend resuelve el cliente desde el JWT: el frontend NUNCA envía
 * `cliente_id`, ni recalcula stock, ni decide expiraciones.
 */

/** Cuerpo de POST /carritos/items. */
export interface AgregarItemCarritoPayload {
  sucursal_id: number;
  inventario_id: number;
  cantidad: number;
}

/** Cuerpo de PATCH /carritos/{carrito_id}/items/{detalle_id}. */
export interface ActualizarCantidadPayload {
  cantidad: number;
}

/** Carrito resumido (una sucursal) devuelto por GET /carritos. */
export interface CarritoResumen {
  carrito_id: number;
  sucursal_id: number;
  sucursal_nombre: string;
  cantidad_lineas: number;
  cantidad_unidades: number;
  subtotal: number;
  fecha_actualizacion: string;
}

/** Respuesta de GET /carritos. */
export interface CarritoListaResponse {
  items: CarritoResumen[];
  total_carritos_activos: number;
}

/** Línea de un carrito (GET /carritos/{carrito_id}). */
export interface CarritoItem {
  detalle_id: number;
  inventario_id: number;
  producto_id: number;
  producto_nombre: string;
  precio_unitario: number;
  imagen_principal: string | null;
  variante_producto_id: number;
  sku: string;
  talla_id: number;
  talla_nombre: string;
  color_id: number;
  color_nombre: string;
  temporada_id: number;
  temporada_nombre: string;
  cantidad: number;
  stock_disponible: number;
  subtotal_linea: number;
}

/** Detalle de un carrito (GET /carritos/{carrito_id}). */
export interface CarritoDetalle {
  carrito_id: number;
  sucursal_id: number;
  sucursal_nombre: string;
  estado: string;
  fecha_creacion: string;
  fecha_actualizacion: string;
  items: CarritoItem[];
  cantidad_total_unidades: number;
  subtotal_carrito: number;
}
