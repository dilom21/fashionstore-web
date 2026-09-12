/**
 * Modelos del dominio Órdenes de compra (CU12).
 *
 * Contrato real del backend (FastAPI), prefijo `/ordenes-compra`:
 * - GET    /ordenes-compra                        -> OrdenCompra[]
 * - POST   /ordenes-compra                        -> OrdenCompra (201)
 * - GET    /ordenes-compra/{id}                   -> OrdenCompra
 * - PATCH  /ordenes-compra/{id}                   -> OrdenCompra
 * - GET    /ordenes-compra/{id}/detalles          -> DetallesOrdenCompra
 * - PUT    /ordenes-compra/{id}/detalles          -> DetallesOrdenCompra
 * - PATCH  /ordenes-compra/{id}/enviar            -> OrdenCompra
 * - PATCH  /ordenes-compra/{id}/cancelar          -> OrdenCompra
 * - POST   /ordenes-compra/{id}/recibir           -> OrdenCompra
 *
 * El backend deriva `empleado_id` del usuario autenticado: Angular NUNCA lo
 * envía. `costo_unitario` es Decimal y puede llegar como número o string; el
 * servicio lo normaliza a número para la UI.
 */

/** Estados válidos de una orden de compra (no inventar otros). */
export type EstadoOrdenCompra =
  | 'BORRADOR'
  | 'ENVIADA'
  | 'PARCIAL'
  | 'RECIBIDA'
  | 'CANCELADA';

/** Lista ordenada de estados para selectores y filtros. */
export const ESTADOS_ORDEN_COMPRA: readonly EstadoOrdenCompra[] = [
  'BORRADOR',
  'ENVIADA',
  'PARCIAL',
  'RECIBIDA',
  'CANCELADA',
] as const;

/** Etiquetas legibles por estado. */
export const ETIQUETAS_ESTADO_ORDEN: Record<EstadoOrdenCompra, string> = {
  BORRADOR: 'Borrador',
  ENVIADA: 'Enviada',
  PARCIAL: 'Parcial',
  RECIBIDA: 'Recibida',
  CANCELADA: 'Cancelada',
};

/** Orden de compra tal como la devuelve GET /ordenes-compra. */
export interface OrdenCompra {
  id: number;
  proveedor_id: number;
  proveedor_razon_social: string;
  sucursal_id: number;
  sucursal_nombre: string;
  empleado_id: number | null;
  fecha_orden: string;
  fecha_estimada: string | null;
  fecha_recepcion: string | null;
  estado: EstadoOrdenCompra;
  observacion: string | null;
  total_detalles: number;
}

/** Filtros admitidos por GET /ordenes-compra. */
export interface OrdenCompraListarFiltros {
  buscar?: string;
  proveedor_id?: number;
  sucursal_id?: number;
  estado?: EstadoOrdenCompra;
  fecha_desde?: string;
  fecha_hasta?: string;
}

/** Cuerpo de POST /ordenes-compra (no se envía `empleado_id`). */
export interface OrdenCompraCreatePayload {
  proveedor_id: number;
  sucursal_id: number;
  fecha_estimada?: string | null;
  observacion?: string | null;
}

/** Cuerpo de PATCH /ordenes-compra/{id} (solo campos editables de cabecera). */
export interface OrdenCompraUpdatePayload {
  fecha_estimada?: string | null;
  observacion?: string | null;
}

/** Elemento del payload de PUT /ordenes-compra/{id}/detalles. */
export interface DetalleOrdenCompraInput {
  variante_producto_id: number;
  temporada_id: number;
  cantidad: number;
  costo_unitario: number;
}

/** Detalle de orden tal como lo devuelve GET /ordenes-compra/{id}/detalles. */
export interface DetalleOrdenCompra {
  id: number;
  variante_producto_id: number;
  temporada_id: number;
  cantidad: number;
  costo_unitario: number;
  sku: string;
  producto_id: number;
  producto_nombre: string;
  temporada_nombre: string;
}

/** Respuesta de GET/PUT /ordenes-compra/{id}/detalles. */
export interface DetallesOrdenCompra {
  orden_compra_id: number;
  total: number;
  detalles: DetalleOrdenCompra[];
}

/** Cuerpo de PUT /ordenes-compra/{id}/detalles (reemplazo total del conjunto). */
export interface DetallesOrdenCompraUpdatePayload {
  detalles: DetalleOrdenCompraInput[];
}
