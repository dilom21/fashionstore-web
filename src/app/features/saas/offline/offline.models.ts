import { TenantIdentidad } from '../services/tenant-api.service';

export type OfflineEstado =
  | 'DISPONIBLE_LOCAL'
  | 'SIN_DATOS'
  | 'DESCARGANDO'
  | 'ERROR'
  | 'DESACTUALIZADO';

export type OfflineOperacionTipo = 'RESERVA' | 'VENTA_CONTADO';
export type OfflineOperacionEstado =
  | 'PENDIENTE'
  | 'ENVIANDO'
  | 'ACEPTADA'
  | 'CONFLICTO'
  | 'RECHAZADA'
  | 'ERROR_REINTENTABLE';

export interface OfflineSnapshot {
  key: string;
  schema_version: 2;
  empresa_id: number;
  empresa_slug: string;
  usuario_id: number;
  contexto: 'personal' | 'cliente';
  sucursal_id: number | null;
  generado_en: string;
  version_datos: string;
  download_started_at: string;
  download_completed_at: string;
  last_successful_sync_at: string;
  expires_at: string | null;
  estado: OfflineEstado;
  source: string;
  counts: {
    productos: number;
    variantes: number;
    disponibilidad: number;
    sucursales: number;
  };
}

/** `id` es la clave local compuesta; los IDs del backend van separados. */
export interface OfflineProducto {
  id: string;
  producto_id: number;
  empresa_id: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
  categoria_id: number;
  categoria_nombre: string;
  snapshot_key: string;
}

export interface OfflineVariante {
  id: string;
  variante_id: number;
  empresa_id: number;
  producto_id: number;
  sku: string;
  talla: string;
  color: string;
  snapshot_key: string;
}

export interface OfflineDisponibilidad {
  id: string;
  inventario_id: number | null;
  empresa_id: number;
  variante_id: number;
  sucursal_id: number;
  stock_disponible_conocido: number;
  fecha_actualizacion: string | null;
  snapshot_key: string;
}

export interface OfflineSucursal {
  id: string;
  sucursal_id: number;
  empresa_id: number;
  nombre: string;
  snapshot_key: string;
}

export interface OfflineOperacionLinea {
  /**
   * `inventario_id` de la proyección POS para `VENTA_CONTADO` (CU20).
   *
   * En `RESERVA` (CU19 CLIENTE) es `null`: el cliente no recibe inventario
   * administrativo. El backend deriva el inventario desde `variante_id`,
   * `sucursal_id` y la empresa del JWT al sincronizar.
   */
  inventario_id: number | null;
  producto_id: number;
  producto_nombre: string;
  variante_id: number;
  sku: string;
  talla: string;
  color: string;
  cantidad: number;
  precio_unitario_provisional: number | null;
}

export interface OfflineOperacion {
  operacion_uuid: string;
  /** Alias de la keyPath para facilitar inspección y compatibilidad del ledger. */
  uuid: string;
  scope_key: string;
  tipo: OfflineOperacionTipo;
  empresa_id: number;
  empresa_slug: string;
  usuario_id: number;
  contexto: 'personal' | 'cliente';
  rol: string;
  sucursal_id: number;
  sucursal_nombre: string;
  fecha: string;
  snapshot_key: string;
  lineas: OfflineOperacionLinea[];
  importe_provisional: number | null;
  metodo_pago: 'EFECTIVO' | null;
  efectivo_recibido: string | null;
  fecha_atencion: string | null;
  observacion: string | null;
  cliente_id: number | null;
  estado: OfflineOperacionEstado;
  intentos: number;
  ultimo_error: string | null;
  error_codigo: string | null;
  id_definitivo: number | null;
  resultado: unknown | null;
  created_at: string;
  updated_at: string;
}

export interface NuevaOfflineOperacion {
  tipo: OfflineOperacionTipo;
  sucursal_id: number;
  sucursal_nombre: string;
  snapshot_key: string;
  lineas: OfflineOperacionLinea[];
  importe_provisional?: number | null;
  efectivo_recibido?: string | null;
  fecha_atencion?: string | null;
  observacion?: string | null;
  cliente_id?: number | null;
}

/** Línea enviada al backend para una RESERVA (CU19): variante + cantidad. */
export interface OfflineOperacionPayloadLineaReserva {
  variante_id: number;
  cantidad: number;
}

/** Línea enviada al backend para una VENTA_CONTADO (CU20): inventario POS. */
export interface OfflineOperacionPayloadLineaVenta {
  inventario_id: number;
  cantidad: number;
}

interface OfflineOperacionPayloadBase {
  operacion_uuid: string;
  sucursal_id: number;
  observacion?: string;
}

/**
 * DTO de RESERVA (CU19): NUNCA incluye `inventario_id`.
 *
 * El backend resuelve el inventario desde la empresa del JWT, `sucursal_id`,
 * `variante_id` y la cantidad, revalidando stock dentro de la transacción.
 */
export interface OfflineOperacionPayloadReserva
  extends OfflineOperacionPayloadBase {
  tipo: 'RESERVA';
  lineas: OfflineOperacionPayloadLineaReserva[];
  fecha_atencion: string;
}

/** DTO de VENTA_CONTADO (CU20): conserva `inventario_id` del POS. */
export interface OfflineOperacionPayloadVenta
  extends OfflineOperacionPayloadBase {
  tipo: 'VENTA_CONTADO';
  lineas: OfflineOperacionPayloadLineaVenta[];
  efectivo_recibido?: string;
  cliente_id?: number;
}

export type OfflineOperacionPayload =
  | OfflineOperacionPayloadReserva
  | OfflineOperacionPayloadVenta;

export interface OfflineOperacionResponse {
  operacion_uuid: string;
  tipo: OfflineOperacionTipo;
  estado: OfflineOperacionEstado;
  id_definitivo: number | null;
  resultado: unknown | null;
  error_codigo: string | null;
  error_mensaje: string | null;
  reintentable: boolean;
}

export function offlineScopeKey(
  identidad: Pick<
    TenantIdentidad,
    'empresa_id' | 'usuario_id' | 'contexto' | 'sucursal_id'
  >,
): string {
  return `${identidad.empresa_id}:${identidad.contexto}:${identidad.usuario_id}:${identidad.sucursal_id ?? 'todas'}`;
}
