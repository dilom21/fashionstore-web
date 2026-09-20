/**
 * Modelos del dominio Ventas digitales (CU19).
 *
 * Los nombres coinciden con el JSON REAL del backend FastAPI:
 *
 *   POST /ventas/digital
 *   -> app/modules/ventas/schemas/schemas.py
 *      (RealizarCompraDigitalRequest / VentaDigitalResponse / VentaItemResponse)
 *
 * El cliente lo resuelve el backend desde el JWT: el frontend NUNCA envía
 * `cliente_id`, `sucursal_id`, precios, total ni estado.
 */

/** Canales admitidos por el backend (`CanalVenta`). */
export type CanalVentaDigital = 'WEB' | 'MOVIL';

/**
 * Cuerpo de POST /ventas/digital.
 *
 * En Web el canal es SIEMPRE 'WEB'; `MOVIL` lo usa Flutter. No se ofrece
 * selector de canal al usuario.
 */
export interface CrearVentaDigitalPayload {
  carrito_id: number;
  canal: 'WEB';
}

/** Línea de la venta digital (snapshot del checkout). */
export interface VentaDigitalItem {
  detalle_id: number;
  inventario_id: number;
  producto_id: number;
  producto_nombre: string;
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
  precio_unitario: number;
  subtotal_linea: number;
}

/**
 * Venta PENDIENTE lista para que CU22 procese el pago electrónico.
 *
 * `carrito_id` puede ser null según el schema del backend. `total` y los
 * importes llegan como Decimal serializado: se normalizan a number solo para
 * presentación (no se recalculan).
 */
export interface VentaDigitalResponse {
  venta_id: number;
  carrito_id: number | null;
  cliente_id: number;
  sucursal_id: number;
  sucursal_nombre: string;
  canal: CanalVentaDigital;
  estado: string;
  fecha_hora: string;
  total: number;
  items: VentaDigitalItem[];
  cantidad_total_unidades: number;
}
