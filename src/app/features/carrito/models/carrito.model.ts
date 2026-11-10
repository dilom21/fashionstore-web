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

/** Cuerpo de POST /carritos/items (contrato LEGACY del primer parcial). */
export interface AgregarItemCarritoPayload {
  sucursal_id: number;
  inventario_id: number;
  cantidad: number;
}

/**
 * Selección de alta de carrito unificada para el facade `CarritoService`.
 *
 * - `inventario`: contrato legacy (saasMode=false), exige `inventario_id`.
 * - `variante`: contrato SaaS (saasMode=true), el backend resuelve el
 *   inventario a partir de `variante_producto_id` + `temporada_id`.
 *
 * Angular NUNCA calcula ni envía un `inventario_id` en modo SaaS.
 */
export interface SeleccionCarritoLegacy {
  modo: 'inventario';
  sucursal_id: number;
  inventario_id: number;
  cantidad: number;
}

export interface SeleccionCarritoSaas {
  modo: 'variante';
  sucursal_id: number;
  variante_producto_id: number;
  temporada_id: number;
  cantidad: number;
}

export type SeleccionCarrito = SeleccionCarritoLegacy | SeleccionCarritoSaas;

/**
 * Resultado de eliminar una línea.
 *
 * - `detalle`: el carrito sigue existiendo; se devuelve su estado actual.
 * - `carrito-eliminado`: la última línea se eliminó y el backend marcó el
 *   carrito como ELIMINADO (no se inventa un detalle vacío).
 */
export type ResultadoEliminarLinea =
  | { tipo: 'detalle'; detalle: CarritoDetalle }
  | { tipo: 'carrito-eliminado'; carrito_id: number };

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
