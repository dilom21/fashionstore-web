import { MetadatosReporte } from './reportes-common.model';

/** Órdenes por estado (`OrdenEstadoResponse`). */
export interface OrdenEstado {
  estado: string;
  cantidad: number;
  valor: number;
}

/**
 * Órdenes por proveedor (`ProveedorOrdenResponse`).
 *
 * Sin rankings subjetivos: solo datos reales de órdenes.
 */
export interface ProveedorOrden {
  proveedor_id: number;
  razon_social: string;
  cantidad_ordenes: number;
  unidades_ordenadas: number;
  valor_ordenes: number;
  ordenes_recibidas: number;
  ordenes_canceladas: number;
  /** Promedio real de días de cumplimiento, o `null` si no hay datos. */
  cumplimiento_promedio_dias: number | null;
}

/** Órdenes por sucursal (`CompraSucursalResponse`). */
export interface CompraSucursal {
  sucursal_id: number;
  sucursal_nombre: string;
  cantidad: number;
  valor: number;
}

/** Productos abastecidos (`CompraProductoResponse`). */
export interface CompraProducto {
  variante_producto_id: number;
  sku: string;
  producto_nombre: string;
  unidades: number;
  valor: number;
}

/** Resumen de compras (`ComprasResumenResponse`). */
export interface ComprasResumen {
  total_ordenes: number;
  unidades_ordenadas: number;
  valor_total_ordenes: number;
  /** Solo órdenes RECIBIDA (el modelo no tiene cantidad_recibida). */
  valor_ordenes_recibidas: number;
}

/** `GET /reportes/compras-proveedores` (no acepta `agrupacion`). */
export interface ReporteComprasResponse {
  metadatos: MetadatosReporte;
  resumen: ComprasResumen;
  ordenes_por_estado: OrdenEstado[];
  ordenes_por_proveedor: ProveedorOrden[];
  ordenes_por_sucursal: CompraSucursal[];
  productos_abastecidos: CompraProducto[];
}
