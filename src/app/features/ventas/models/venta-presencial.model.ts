/**
 * Modelos del dominio Ventas presenciales (CU20).
 *
 * Los nombres coinciden EXACTAMENTE con el JSON real del backend FastAPI:
 *
 *   POST /ventas/presencial
 *   -> app/modules/ventas/schemas/schemas.py
 *      (VentaPresencialItemRequest / RegistrarVentaPresencialRequest /
 *       VentaPresencialResponse / VentaItemResponse)
 *
 * El frontend NUNCA envía `empleado_id`, `sucursal_id`, `canal`, `estado`,
 * `precio_unitario` ni `total`: los determina el backend.
 */

/** Canal fijo de una venta de tienda (lo decide el backend). */
export type CanalVentaPresencial = 'PRESENCIAL';

/**
 * Prenda realmente vendida: fila de inventario y cantidad (VentaPresencialItemRequest).
 */
export interface VentaPresencialItemRequest {
  inventario_id: number;
  /** El backend exige ge=1: solo se envían prendas con cantidad > 0. */
  cantidad: number;
}

/**
 * Cuerpo de POST /ventas/presencial (RegistrarVentaPresencialRequest).
 *
 * - `reserva_id` nulo: venta presencial directa (cliente opcional / anónimo).
 * - `reserva_id` informado: venta proveniente de CU18; el backend prohíbe
 *   enviar `cliente_id` junto a la reserva.
 */
export interface RegistrarVentaPresencialRequest {
  reserva_id?: number | null;
  cliente_id?: number | null;
  items: VentaPresencialItemRequest[];
}

/** Línea de la venta presencial (snapshot del backend). */
export interface VentaPresencialItemResponse {
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
 * Venta PENDIENTE de tienda lista para que CU21 registre el pago.
 *
 * CU21 necesita especialmente `venta_id`, `total` y `estado`.
 * `cliente_id`, `empleado_id` y `reserva_id` pueden ser null según el esquema.
 * `total` y los importes llegan como Decimal serializado: se normalizan a
 * number solo para presentación (no se recalculan).
 */
export interface VentaPresencialResponse {
  venta_id: number;
  cliente_id: number | null;
  empleado_id: number | null;
  sucursal_id: number;
  sucursal_nombre: string;
  reserva_id: number | null;
  canal: CanalVentaPresencial;
  estado: string;
  fecha_hora: string;
  total: number;
  items: VentaPresencialItemResponse[];
  cantidad_total_unidades: number;
}
