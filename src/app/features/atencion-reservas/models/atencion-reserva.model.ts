/**
 * Modelos del dominio CU18 - Atender reserva de prendas
 * (ENCARGADO_SUCURSAL / CAJERO).
 *
 * Copiados del contrato REAL del backend
 * (app/modules/reservas/schemas/schemas.py, seccion CU18):
 * AtencionReservaItemResponse, AtencionReservaResumenResponse,
 * AtencionReservaListaResponse, AtencionReservaDetalleResponse,
 * PrepararVentaItemRequest, PrepararVentaRequest, PrepararVentaItemResponse,
 * PrepararVentaResponse y FinalizarSinCompraRequest.
 *
 * No se reutilizan los modelos de CU16/CU17 porque el contrato difiere: aquí
 * las líneas traen `cantidad_reservada` (no `cantidad`) y la reserva no expone
 * `carrito_id`. La sucursal NUNCA se envía: la toma el backend del empleado.
 */

/** Estados reales de la tabla reserva usados por CU18. */
export type EstadoReservaAtencion =
  | 'PENDIENTE'
  | 'CONFIRMADA'
  | 'ATENDIDA'
  | 'CANCELADA'
  | 'VENCIDA';

/** Prenda reservada tal como la ve el empleado (AtencionReservaItemResponse). */
export interface AtencionReservaItem {
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
  cantidad_reservada: number;
}

/** Reserva del listado operativo (AtencionReservaResumenResponse). */
export interface AtencionReservaResumen {
  reserva_id: number;
  cliente_id: number;
  cliente_nombre: string;
  cliente_apellido: string;
  cliente_telefono: string | null;
  sucursal_id: number;
  sucursal_nombre: string;
  fecha_reserva: string;
  fecha_atencion: string;
  estado: EstadoReservaAtencion;
  observacion: string | null;
  cantidad_lineas: number;
  cantidad_unidades: number;
}

/** Respuesta paginada de GET /atencion-reservas. */
export interface AtencionReservaListaResponse {
  items: AtencionReservaResumen[];
  total: number;
  limit: number;
  offset: number;
}

/** Venta ya asociada a la reserva (CU20), expuesta por el detalle CU18. */
export interface VentaAsociadaAtencion {
  venta_id: number;
  estado: string;
  /** Decimal serializado por el backend: se normaliza solo para presentación. */
  total: number;
  canal: string;
}

/** Estado mínimo de la venta asociada que maneja la pantalla de atención. */
export interface VentaAtencionResumen {
  venta_id: number;
  estado: string;
  total: number;
  canal: string;
  reserva_id: number | null;
}

/** Detalle operativo (AtencionReservaDetalleResponse). */
export interface AtencionReservaDetalle {
  reserva_id: number;
  cliente_id: number;
  cliente_nombre: string;
  cliente_apellido: string;
  cliente_telefono: string | null;
  sucursal_id: number;
  sucursal_nombre: string;
  fecha_reserva: string;
  fecha_atencion: string;
  estado: EstadoReservaAtencion;
  observacion: string | null;
  items: AtencionReservaItem[];
  cantidad_total_unidades: number;
  /**
   * Venta (CU20) ya asociada a la reserva; null si aún no existe. Permite
   * recuperar el estado de venta tras recargar o reabrir la atención.
   */
  venta_asociada: VentaAsociadaAtencion | null;
}

/** Línea de la selección de compra (PrepararVentaItemRequest). */
export interface PrepararVentaItemRequest {
  inventario_id: number;
  /** El backend exige ge=1: solo se envían prendas con cantidad > 0. */
  cantidad_compra: number;
}

/** Cuerpo de POST /atencion-reservas/{id}/preparar-venta (min_length=1). */
export interface PrepararVentaRequest {
  items: PrepararVentaItemRequest[];
}

/** Línea normalizada que devuelve el backend. */
export interface PrepararVentaItemResponse {
  inventario_id: number;
  cantidad_reservada: number;
  cantidad_compra: number;
  cantidad_no_compra: number;
}

/** Resultado SOLO de validación: la venta todavía NO ocurrió. */
export interface PrepararVentaResponse {
  reserva_id: number;
  sucursal_id: number;
  estado: string;
  items: PrepararVentaItemResponse[];
  total_unidades_reservadas: number;
  total_unidades_compra: number;
  total_unidades_no_compra: number;
  venta_registrada: boolean;
  reserva_modificada: boolean;
}

/** Cuerpo de POST /atencion-reservas/{id}/finalizar-sin-compra. */
export interface FinalizarSinCompraRequest {
  observacion: string | null;
}

/** Filtros reales de GET /atencion-reservas. */
export interface AtencionReservaFiltros {
  /** Búsqueda por id de reserva, nombre o apellido del cliente. */
  buscar?: string;
  /**
   * Solo lo envía el ADMINISTRADOR para elegir sucursal. El ENCARGADO y el
   * CAJERO nunca lo envían: el backend aplica su sucursal.
   */
  sucursal_id?: number;
  /** Filtra por fecha_atencion (inclusive), formato YYYY-MM-DD. */
  fecha_desde?: string;
  fecha_hasta?: string;
  limit?: number;
  offset?: number;
}

/** Longitud máxima admitida por el backend para la observación. */
export const OBSERVACION_MAX_LENGTH = 500;

/** Único estado atendible por CU18. */
export const ESTADO_ATENDIBLE = 'CONFIRMADA';
