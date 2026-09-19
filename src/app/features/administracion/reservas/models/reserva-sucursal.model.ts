/**
 * Modelos del dominio CU17 - Gestionar reservas de sucursal (ADMINISTRADOR /
 * ENCARGADO_SUCURSAL).
 *
 * Copiados del contrato REAL del backend
 * (app/modules/reservas/schemas/schemas.py):
 * ReservaSucursalResumenResponse, ReservaSucursalListaResponse,
 * ReservaSucursalDetalleResponse, ReservaItemResponse,
 * CancelarReservaSucursalRequest y EstadoReservaFiltro.
 *
 * El alcance por sucursal lo aplica el backend: si el ENCARGADO_SUCURSAL pide
 * otra sucursal responde 403.
 */

/** Estados reales de la reserva (enum EstadoReservaFiltro del backend). */
export type EstadoReservaSucursal =
  | 'PENDIENTE'
  | 'CONFIRMADA'
  | 'ATENDIDA'
  | 'CANCELADA'
  | 'VENCIDA';

/** Reserva tal como la ve el personal de sucursal (sin datos sensibles). */
export interface ReservaSucursalResumen {
  reserva_id: number;
  carrito_id: number | null;
  cliente_id: number;
  cliente_nombre: string;
  cliente_apellido: string;
  cliente_telefono: string | null;
  sucursal_id: number;
  sucursal_nombre: string;
  fecha_reserva: string;
  fecha_atencion: string;
  estado: EstadoReservaSucursal;
  observacion: string | null;
  cantidad_lineas: number;
  cantidad_unidades: number;
}

/** Respuesta paginada de GET /reservas-sucursal. */
export interface ReservaSucursalListaResponse {
  items: ReservaSucursalResumen[];
  total: number;
  limit: number;
  offset: number;
}

/** Prenda de la reserva (ReservaItemResponse). */
export interface ReservaSucursalItem {
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

/** Detalle de la reserva (GET /reservas-sucursal/{reserva_id}). */
export interface ReservaSucursalDetalle {
  reserva_id: number;
  carrito_id: number | null;
  cliente_id: number;
  cliente_nombre: string;
  cliente_apellido: string;
  cliente_telefono: string | null;
  sucursal_id: number;
  sucursal_nombre: string;
  fecha_reserva: string;
  fecha_atencion: string;
  estado: EstadoReservaSucursal;
  observacion: string | null;
  items: ReservaSucursalItem[];
  cantidad_total_unidades: number;
}

/** Filtros reales admitidos por GET /reservas-sucursal. */
export interface ReservaSucursalFiltros {
  sucursal_id?: number;
  estado?: EstadoReservaSucursal;
  /** Búsqueda por id de reserva, nombre o apellido del cliente. */
  buscar?: string;
  /** Filtra por fecha_atencion (inclusive), formato YYYY-MM-DD. */
  fecha_desde?: string;
  fecha_hasta?: string;
  limit?: number;
  offset?: number;
}

/** Cuerpo de PATCH /reservas-sucursal/{reserva_id}/cancelar. */
export interface CancelarReservaSucursalPayload {
  observacion: string | null;
}

/** Totales reales para las tarjetas de resumen. */
export interface ReservasSucursalResumen {
  total: number;
  pendientes: number;
  confirmadas: number;
  canceladas: number;
}
