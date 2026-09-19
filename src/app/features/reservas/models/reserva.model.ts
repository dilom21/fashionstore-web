/**
 * Modelos del dominio Reservas de prendas (CU16).
 *
 * Los nombres coinciden exactamente con el contrato real del backend FastAPI
 * (POST /reservas, GET /reservas, GET /reservas/{id},
 * PATCH /reservas/{id}/cancelar), verificado en /openapi.json:
 * CrearReservaRequest, CancelarReservaRequest, ReservaResumenResponse,
 * ReservaItemResponse, ReservaDetalleResponse, ReservaListaResponse.
 *
 * El backend resuelve el cliente desde el JWT: el frontend NUNCA envía
 * `cliente_id`, ni `sucursal_id`, ni prendas/cantidades (salen del carrito).
 */

/** Estados admitidos por el backend (enum EstadoReservaFiltro). */
export type EstadoReserva =
  | 'PENDIENTE'
  | 'CONFIRMADA'
  | 'ATENDIDA'
  | 'CANCELADA'
  | 'VENCIDA';

/** Cuerpo de POST /reservas. */
export interface CrearReservaPayload {
  carrito_id: number;
  /** datetime ISO: fecha + hora de atención. */
  fecha_atencion: string;
  observacion: string | null;
}

/** Cuerpo de PATCH /reservas/{reserva_id}/cancelar. */
export interface CancelarReservaPayload {
  observacion: string | null;
}

/** Reserva resumida devuelta por GET /reservas. */
export interface ReservaResumen {
  reserva_id: number;
  carrito_id: number;
  cliente_id: number;
  sucursal_id: number;
  sucursal_nombre: string;
  fecha_reserva: string;
  fecha_atencion: string;
  estado: EstadoReserva;
  observacion: string | null;
  cantidad_lineas: number;
  cantidad_unidades: number;
}

/** Prenda reservada (ReservaItemResponse). */
export interface ReservaItem {
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
}

/** Detalle de una reserva (ReservaDetalleResponse). */
export interface ReservaDetalle {
  reserva_id: number;
  carrito_id: number;
  cliente_id: number;
  sucursal_id: number;
  sucursal_nombre: string;
  fecha_reserva: string;
  fecha_atencion: string;
  estado: EstadoReserva;
  observacion: string | null;
  items: ReservaItem[];
  cantidad_total_unidades: number;
}

/** Respuesta de GET /reservas. */
export interface ReservaListaResponse {
  items: ReservaResumen[];
  total_reservas: number;
}
