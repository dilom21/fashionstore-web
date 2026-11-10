export type OfflineEstado = 'DISPONIBLE_LOCAL' | 'SIN_DATOS' | 'DESCARGANDO' | 'ERROR' | 'DESACTUALIZADO';

export interface OfflineSnapshot {
  key: string;
  schema_version: number;
  empresa_id: number;
  empresa_slug: string;
  usuario_id: number;
  sucursal_id: number | null;
  generado_en: string;
  version_datos: string;
  download_started_at: string;
  download_completed_at: string | null;
  last_successful_sync_at: string | null;
  expires_at?: string | null;
  estado: OfflineEstado;
  source: string;
  counts: { productos: number; variantes: number; disponibilidad: number; sucursales: number };
}

export interface OfflineProducto { id: number; empresa_id: number; nombre: string; descripcion?: string | null; precio: number | string; categoria_id: number; categoria_nombre?: string; snapshot_key: string; }
export interface OfflineVariante { id: number; empresa_id: number; producto_id: number; sku: string; talla: string; color: string; snapshot_key: string; }
export interface OfflineDisponibilidad { id: string; empresa_id: number; variante_id: number; sucursal_id: number; stock_disponible_conocido: number; fecha_actualizacion: string; snapshot_key: string; }
export interface OfflineSucursal { id: number; empresa_id: number; nombre: string; snapshot_key: string; }
