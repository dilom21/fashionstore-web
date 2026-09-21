/**
 * Modelos del dominio Historial de compras (CU24 - Consultar historial de compras).
 *
 * Los nombres coinciden EXACTAMENTE con el JSON real del backend FastAPI:
 *
 *   GET /ventas/historial            -> HistorialComprasResponse
 *   GET /ventas/historial/{venta_id} -> HistorialCompraDetalleResponse
 *   -> app/modules/ventas/schemas/historial.py
 *
 * Solo lectura y solo del propio cliente: la identidad sale del JWT
 * (`get_current_cliente`). El frontend NUNCA envía `cliente_id`.
 *
 * No existe una entidad `historial` persistida: se construye desde venta +
 * detalle_venta + pago + sucursal. CU24 no genera comprobantes (eso es CU23),
 * no genera PDF y no expone datos de tarjeta.
 *
 * El LISTADO no devuelve imágenes, cliente, cajero ni método de pago: no se
 * inventan. Tampoco existen agregados globales (completadas totales o monto
 * acumulado de todo el historial), por lo que las tarjetas de resumen usan
 * únicamente los metadatos reales de la consulta.
 */

/** Estados reales del historial (`PENDIENTE`/`PAGADA` quedan fuera). */
export type EstadoHistorial = 'COMPLETADA' | 'CANCELADA' | 'REEMBOLSADA';

/** Canales reales de `venta.canal` (CK venta_canal). */
export type CanalHistorial = 'WEB' | 'MOVIL' | 'PRESENCIAL';

export const ESTADOS_HISTORIAL: readonly EstadoHistorial[] = [
  'COMPLETADA',
  'CANCELADA',
  'REEMBOLSADA',
];

export const CANALES_HISTORIAL: readonly CanalHistorial[] = [
  'WEB',
  'MOVIL',
  'PRESENCIAL',
];

/** Tamaño de página por defecto del backend (`tamano_pagina`). */
export const TAMANO_PAGINA_HISTORIAL = 20;

/** Fila del listado (`HistorialCompraResumenResponse`). */
export interface HistorialCompraResumen {
  venta_id: number;
  fecha_hora: string;
  canal: string;
  estado: string;
  /** Decimal normalizado a number solo para presentación. */
  total: number;
  sucursal_id: number;
  sucursal_nombre: string;
  cantidad_total_unidades: number;
  cantidad_lineas: number;
}

/** Historial paginado (`HistorialComprasResponse`). */
export interface HistorialComprasResponse {
  items: HistorialCompraResumen[];
  pagina: number;
  tamano_pagina: number;
  total_registros: number;
  total_paginas: number;
}

/** Sucursal de la compra (`HistorialCompraSucursalResponse`). */
export interface HistorialCompraSucursal {
  id: number;
  nombre: string;
  direccion: string;
  telefono: string | null;
}

/** Pago más relevante de la venta (`HistorialCompraPagoResponse`). */
export interface HistorialCompraPago {
  pago_id: number;
  fecha_hora: string;
  /** Decimal normalizado a number solo para presentación. */
  monto: number;
  metodo: string;
  estado: string;
  referencia_transaccion: string | null;
  pasarela: string | null;
}

/** Línea del detalle (`HistorialCompraItemResponse`). */
export interface HistorialCompraItem {
  detalle_venta_id: number;
  inventario_id: number;
  producto_id: number;
  producto_nombre: string;
  variante_producto_id: number;
  sku: string;
  talla_nombre: string;
  color_nombre: string;
  cantidad: number;
  /** Decimal normalizado a number solo para presentación. */
  precio_unitario: number;
  /** Decimal normalizado a number solo para presentación. */
  subtotal_linea: number;
}

/** Detalle completo de una compra (`HistorialCompraDetalleResponse`). */
export interface HistorialCompraDetalle {
  venta_id: number;
  fecha_hora: string;
  canal: string;
  estado: string;
  /** Decimal normalizado a number: es la autoridad del backend. */
  total: number;
  carrito_id: number | null;
  reserva_id: number | null;
  sucursal: HistorialCompraSucursal;
  /** `null` cuando la venta no tiene pago registrado. */
  pago: HistorialCompraPago | null;
  items: HistorialCompraItem[];
  cantidad_total_unidades: number;
}

/**
 * Filtros soportados por el backend CU24.
 *
 * No existe filtro por código de venta ni por ordenamiento: solo los que
 * expone `GET /ventas/historial`.
 */
export interface HistorialComprasFiltros {
  estado?: EstadoHistorial | null;
  canal?: CanalHistorial | null;
  /** `YYYY-MM-DD` (el backend incluye todo el día). */
  fecha_desde?: string | null;
  /** `YYYY-MM-DD` (el backend incluye todo el día). */
  fecha_hasta?: string | null;
  pagina?: number;
  tamano_pagina?: number;
}

/** Fecha `dd/MM/yyyy` (misma regla de presentación que CU23). */
export function formatearFecha(valor: string): string {
  const marca = new Date(valor);
  if (Number.isNaN(marca.getTime())) {
    return valor ?? '';
  }
  const dia = String(marca.getDate()).padStart(2, '0');
  const mes = String(marca.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${marca.getFullYear()}`;
}

/** ¿La compra permite abrir el comprobante? CU23 exige venta COMPLETADA. */
export function puedeVerComprobante(estado: string): boolean {
  return (estado ?? '').trim().toUpperCase() === 'COMPLETADA';
}
