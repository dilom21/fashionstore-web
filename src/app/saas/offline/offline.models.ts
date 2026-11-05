import {
  MetodoPagoTenant,
  TenantInventario,
  TenantSucursal,
} from '../models/tenant.models';

/**
 * Contratos de la operación offline de la PWA.
 *
 * Reglas de diseño:
 * - Cada operación tiene un `operacion_id` UUID propio generado en el cliente.
 * - El registro se separa por `empresa_id` + `usuario_id`: una sesión nunca
 *   lista ni drena operaciones de otra empresa o de otro usuario.
 * - NUNCA se guardan tokens, contraseñas ni claves: solo la carga funcional
 *   mínima que el contrato tenant acepta y el resultado público del servidor.
 * - El servidor sigue siendo la autoridad de precios, stock, permisos y
 *   secuencias; la cola local solo conserva la intención hasta confirmarla.
 */

/** Tipos de operación tolerados por la cola offline. */
export type TipoOperacionOffline =
  | 'VENTA_CONTADO'
  | 'RESERVA_CREAR'
  | 'RESERVA_CANCELAR'
  | 'RESERVA_FINALIZAR';

/**
 * Estados del ciclo de vida de una operación.
 *
 * - `PENDIENTE`: registrada localmente, aún no enviada (o esperando backoff).
 * - `ENVIADO`: hay una petición en curso; si la pestaña se cierra queda
 *   reclamable para reintento idempotente.
 * - `CONFIRMADO`: el servidor aceptó o ya tenía registrada la operación.
 * - `CONFLICTO`: el servidor rechazó la carga por estado/duplicado distinto;
 *   la operación NO se borra y requiere revisión humana.
 * - `ERROR`: fallo definitivo no reintentable automáticamente (4xx/503).
 */
export type EstadoOperacionOffline =
  | 'PENDIENTE'
  | 'ENVIADO'
  | 'CONFIRMADO'
  | 'CONFLICTO'
  | 'ERROR';

/** Identidad local que aísla los datos de la cola y de la caché. */
export interface ScopeOffline {
  empresa_id: number;
  usuario_id: number;
  empresa_slug: string;
}

/** Carga exacta de `POST /tenant/ventas/contado` (sin montos ni empresa). */
export interface PayloadVentaContado {
  sucursal_id: number;
  metodo_pago: MetodoPagoTenant;
  lineas: Array<{ inventario_id: number; cantidad: number }>;
}

/** Carga exacta de `POST /tenant/reservas` (contexto cliente). */
export interface PayloadReservaCrear {
  carrito_id: number;
  fecha_atencion: string;
  observacion?: string | null;
}

/** Carga de las acciones `PATCH /tenant/reservas/{id}/...`. */
export interface PayloadReservaAccion {
  reserva_id: number;
  observacion?: string | null;
}

export type PayloadOperacionOffline =
  | PayloadVentaContado
  | PayloadReservaCrear
  | PayloadReservaAccion;

/** Resultado público que el servidor devolvió al confirmar la operación. */
export interface ResultadoOperacionOffline {
  referencia_id: number | null;
  estado: string | null;
  idempotente: boolean;
}

/** Detalle del rechazo que dejó la operación en conflicto. */
export interface ConflictoOperacionOffline {
  codigo: number;
  detalle: string;
}

/** Registro persistido en IndexedDB (`operaciones`). */
export interface OperacionOffline {
  /** UUID de idempotencia y clave primaria local. */
  operacion_id: string;
  tipo: TipoOperacionOffline;
  estado: EstadoOperacionOffline;
  empresa_id: number;
  usuario_id: number;
  empresa_slug: string;
  creada_en: string;
  actualizada_en: string;
  intentos: number;
  /** Backoff: momento mínimo del siguiente envío automático. */
  proximo_intento_en: string | null;
  payload: PayloadOperacionOffline;
  resultado: ResultadoOperacionOffline | null;
  conflicto: ConflictoOperacionOffline | null;
  ultimo_error: string | null;
}

/** Caché local genérica de consulta (inventario, sucursales, catálogo). */
export interface CacheLocal<T> {
  /** Clave compuesta `empresa:usuario:tipo:detalle`. */
  clave: string;
  tipo: string;
  detalle: string;
  empresa_id: number;
  usuario_id: number;
  actualizado_en: string;
  datos: T;
}

/** Inventario cacheado de una sucursal para vender sin conexión. */
export type CacheInventario = CacheLocal<TenantInventario[]>;

/** Sucursales cacheadas de la empresa. */
export type CacheSucursales = CacheLocal<TenantSucursal[]>;

/** Resumen visible de una sincronización. */
export interface ResumenSincronizacion {
  ejecutada: boolean;
  confirmadas: number;
  conflictos: number;
  errores: number;
  reintentables: number;
  omitidas: number;
  motivo:
    | 'ok'
    | 'sin-conexion'
    | 'sin-sesion'
    | 'en-curso'
    | 'sin-pendientes'
    | 'error-local';
}

/** Máximo de intentos automáticos antes de exigir revisión humana. */
export const MAX_INTENTOS_OFFLINE = 5;

/** Base del backoff exponencial (2 s, 4 s, 8 s, 16 s, 32 s). */
const BACKOFF_BASE_MS = 2_000;

/** Tope del backoff para no dejar la operación bloqueada demasiado tiempo. */
const BACKOFF_TOPE_MS = 60_000;

/** Retraso del siguiente intento automático tras `intentos` fallos. */
export function retrasoReintentoMs(intentos: number): number {
  const factor = Math.max(1, Math.floor(intentos));
  return Math.min(BACKOFF_BASE_MS * 2 ** (factor - 1), BACKOFF_TOPE_MS);
}

/** `true` si la operación todavía debe vigilarse en la cola. */
export function esOperacionPendiente(
  operacion: OperacionOffline,
): boolean {
  return (
    operacion.estado === 'PENDIENTE' ||
    operacion.estado === 'ENVIADO' ||
    operacion.estado === 'ERROR'
  );
}

/** `true` si la operación puede reintentarse automáticamente. */
export function esReintentable(operacion: OperacionOffline): boolean {
  if (operacion.estado === 'CONFIRMADO' || operacion.estado === 'CONFLICTO') {
    return false;
  }
  return operacion.intentos < MAX_INTENTOS_OFFLINE;
}

/** Etiqueta legible del tipo de operación. */
export function etiquetaTipoOperacion(tipo: TipoOperacionOffline): string {
  switch (tipo) {
    case 'VENTA_CONTADO':
      return 'Venta de contado';
    case 'RESERVA_CREAR':
      return 'Reserva';
    case 'RESERVA_CANCELAR':
      return 'Cancelación de reserva';
    case 'RESERVA_FINALIZAR':
      return 'Reserva atendida sin compra';
  }
}

/** Etiqueta legible del estado de sincronización. */
export function etiquetaEstadoOffline(
  estado: EstadoOperacionOffline,
): string {
  switch (estado) {
    case 'PENDIENTE':
      return 'Pendiente';
    case 'ENVIADO':
      return 'Enviando';
    case 'CONFIRMADO':
      return 'Confirmada';
    case 'CONFLICTO':
      return 'En conflicto';
    case 'ERROR':
      return 'Rechazada';
  }
}
