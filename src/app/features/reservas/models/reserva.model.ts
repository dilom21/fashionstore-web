/**
 * Modelos del dominio Reservas de prendas (CU11/CU16).
 *
 * El frontend trabaja con estos tipos INTERNOS, normalizados desde dos
 * contratos distintos del backend:
 *  - Legacy (saasMode=false): POST/GET /reservas...
 *  - SaaS (saasMode=true):   POST/GET /tenant/reservas...
 *
 * Diferencias relevantes del contrato SaaS (verificado en el código de FastAPI):
 *  - `crear` devuelve `{reserva_id, carrito_id, estado}`, NO el detalle.
 *  - `cancelar` devuelve `{reserva_id, estado}`, NO el detalle.
 *  - El listado devuelve `{items, total, limit, offset}`.
 *  - Las líneas usan `imagen_principal_url` (no `imagen_principal`).
 *  - El detalle resume `cantidad_unidades` (no `cantidad_total_unidades`).
 *  - `fecha_atencion` debe incluir zona horaria.
 *
 * El cliente lo resuelve el backend desde el JWT: el frontend NUNCA envía
 * `cliente_id` ni `empresa_id`. La sucursal y las prendas salen del carrito.
 */

/** Estados admitidos por el backend (enum EstadoReservaFiltro). */
export type EstadoReserva =
  | 'PENDIENTE'
  | 'CONFIRMADA'
  | 'ATENDIDA'
  | 'CANCELADA'
  | 'VENCIDA';

/** Datos del formulario de atención que produce una solicitud de reserva. */
export interface ReservaAtencionSeleccion {
  carrito_id: number;
  /** Fecha local del formulario (YYYY-MM-DD). */
  fecha: string;
  /** Hora local del formulario (HH:MM). */
  hora: string;
  observacion: string | null;
}

/** Cuerpo de POST /reservas (contrato LEGACY del primer parcial). */
export interface CrearReservaPayload {
  carrito_id: number;
  /** datetime ISO: fecha + hora de atención. */
  fecha_atencion: string;
  observacion: string | null;
}

/** Cuerpo de PATCH .../cancelar. */
export interface CancelarReservaPayload {
  observacion: string | null;
}

/** Resultado de crear una reserva (ambos contratos). */
export interface ReservaCreada {
  reserva_id: number;
  carrito_id: number | null;
  estado: string;
}

/** Resultado de cancelar una reserva (ambos contratos). */
export interface ReservaEstado {
  reserva_id: number;
  estado: string;
}

/** Prevalidación SaaS (informativa: NUNCA crea la reserva). */
export interface PrevalidacionReserva {
  carrito_id: number;
  sucursal_id: number;
  fecha_atencion: string;
  cantidad_lineas: number;
  cantidad_unidades: number;
  stock_verificado_preliminarmente: boolean;
  /** Siempre false en la prevalidación real del backend. */
  reserva_creada: boolean;
  requiere_verificacion_transaccional: boolean;
}

/** Reserva resumida (listado). */
export interface ReservaResumen {
  reserva_id: number;
  carrito_id: number | null;
  sucursal_id: number;
  sucursal_nombre: string;
  fecha_reserva: string;
  fecha_atencion: string;
  estado: EstadoReserva;
  observacion: string | null;
  cantidad_lineas: number;
  cantidad_unidades: number;
}

/** Prenda reservada. */
export interface ReservaItem {
  detalle_id: number;
  inventario_id: number;
  producto_id: number;
  producto_nombre: string;
  imagen_principal_url: string | null;
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

/** Detalle de una reserva. */
export interface ReservaDetalle extends ReservaResumen {
  items: ReservaItem[];
}

/** Respuesta paginada del listado (unificada). */
export interface ReservaListaResponse {
  items: ReservaResumen[];
  total: number;
  limit: number;
  offset: number;
}
