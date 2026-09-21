/**
 * Modelos del dominio Devoluciones (CU25 - Registrar devolución de productos).
 *
 * Los nombres coinciden EXACTAMENTE con el JSON real del backend FastAPI:
 *
 *   GET  /devoluciones                              -> DevolucionesListaResponse
 *   GET  /devoluciones/{id}                         -> DevolucionDetalleResponse
 *   GET  /devoluciones/ventas/{venta_id}/disponibilidad
 *                                                   -> DisponibilidadVentaResponse
 *   POST /devoluciones                              -> DevolucionDetalleResponse
 *   POST /devoluciones/{id}/aprobar|rechazar|procesar
 *   -> app/modules/devoluciones/schemas/schemas.py
 *
 * CU25 es devolución FÍSICA de producto + reingreso a inventario. NO hay
 * reembolso financiero: por eso los importes se llaman `precio_unitario` y
 * `subtotal_referencial` (nunca `monto_reembolsado`), no se toca `pago` y no se
 * cambia el estado de la venta.
 *
 * El inventario solo cambia al PROCESAR (COMPLETADA): registrar (SOLICITADA) y
 * aprobar (APROBADA) todavía no modifican stock.
 *
 * No se inventan campos: `devolucion` no tiene `motivo_rechazo` y el código
 * visual (DEV-00012) es responsabilidad del frontend; el backend devuelve
 * `devolucion_id`.
 */

/** Estados reales de `ck_devolucion_estado`. */
export type EstadoDevolucion =
  | 'SOLICITADA'
  | 'APROBADA'
  | 'RECHAZADA'
  | 'COMPLETADA';

export const ESTADOS_DEVOLUCION: readonly EstadoDevolucion[] = [
  'SOLICITADA',
  'APROBADA',
  'RECHAZADA',
  'COMPLETADA',
];

/** Tamaño de página por defecto del backend (`tamano_pagina`). */
export const TAMANO_PAGINA_DEVOLUCIONES = 20;

/** Sucursal de la devolución (`DevolucionSucursalResponse`). */
export interface DevolucionSucursal {
  id: number;
  nombre: string;
  direccion: string;
}

/** Cliente de la venta original (`null` en ventas presenciales anónimas). */
export interface DevolucionCliente {
  id: number;
  nombre: string;
  apellido: string;
}

/** Venta original dentro de la devolución. */
export interface DevolucionVentaResumen {
  venta_id: number;
  fecha_hora: string;
  canal: string;
  /** Decimal normalizado a number solo para presentación. */
  total: number;
}

/** Fila del listado (`DevolucionResumenResponse`). */
export interface DevolucionResumen {
  devolucion_id: number;
  venta_id: number;
  fecha_hora: string;
  estado: string;
  motivo: string;
  sucursal_id: number;
  sucursal_nombre: string;
  cantidad_lineas: number;
  cantidad_total_unidades: number;
}

/** Listado paginado (`DevolucionesListaResponse`). */
export interface DevolucionesListaResponse {
  items: DevolucionResumen[];
  pagina: number;
  tamano_pagina: number;
  total_registros: number;
  total_paginas: number;
}

/** Filtros reales de `GET /devoluciones`. */
export interface DevolucionesFiltros {
  estado?: EstadoDevolucion | null;
  /** Solo ADMINISTRADOR; el ENCARGADO siempre ve su sucursal. */
  sucursal_id?: number | null;
  fecha_desde?: string | null;
  fecha_hasta?: string | null;
  pagina?: number;
  tamano_pagina?: number;
}

/** Línea del detalle de la devolución (`DevolucionItemResponse`). */
export interface DevolucionItem {
  detalle_devolucion_id: number;
  detalle_venta_id: number;
  producto_id: number;
  producto_nombre: string;
  sku: string;
  talla_nombre: string;
  color_nombre: string;
  cantidad_vendida: number;
  cantidad_solicitada: number;
  /** Decimal normalizado a number solo para presentación. */
  precio_unitario: number;
  /** Decimal normalizado a number solo para presentación (no es reembolso). */
  subtotal_referencial: number;
  motivo: string | null;
}

/** Detalle completo (`DevolucionDetalleResponse`). */
export interface DevolucionDetalle {
  devolucion_id: number;
  venta_id: number;
  fecha_hora: string;
  motivo: string;
  observacion: string | null;
  estado: string;
  venta: DevolucionVentaResumen;
  sucursal: DevolucionSucursal;
  cliente: DevolucionCliente | null;
  items: DevolucionItem[];
  cantidad_total_unidades: number;
}

/**
 * Línea del `POST /devoluciones`.
 *
 * Solo se envían `detalle_venta_id`, `cantidad` y `motivo`: el estado, la
 * sucursal y los precios los determina el backend.
 */
export interface RegistrarDevolucionItemRequest {
  detalle_venta_id: number;
  cantidad: number;
  motivo?: string | null;
}

/** Cuerpo real de `POST /devoluciones` (RegistrarDevolucionRequest). */
export interface RegistrarDevolucionRequest {
  venta_id: number;
  /** Obligatorio (1..255); el backend guarda texto, no un enum. */
  motivo: string;
  observacion?: string | null;
  items: RegistrarDevolucionItemRequest[];
}

/**
 * Motivos sugeridos en la interfaz.
 *
 * Es una ayuda de captura: el backend guarda texto libre (`motivo`), por lo que
 * "Otro" permite escribir cualquier motivo válido.
 */
export const MOTIVOS_DEVOLUCION: readonly string[] = [
  'Producto defectuoso',
  'Talla incorrecta',
  'Producto equivocado',
  'Cambio de opinión',
  'Otro',
];

/** Valor del selector que habilita el motivo libre. */
export const MOTIVO_OTRO = 'Otro';

/** Código visual de devolución (`DEV-00012`); no altera el id real. */
export function codigoDevolucion(devolucionId: number): string {
  const numero = Number(devolucionId);
  const id = Number.isFinite(numero) ? Math.trunc(numero) : 0;
  return `DEV-${String(id).padStart(5, '0')}`;
}

const ESTADO_MAYUSCULAS = (estado: string): string =>
  (estado ?? '').trim().toUpperCase();

/** SOLICITADA permite aprobar o rechazar. */
export function puedeAprobarDevolucion(estado: string): boolean {
  return ESTADO_MAYUSCULAS(estado) === 'SOLICITADA';
}

/** SOLICITADA permite rechazar. */
export function puedeRechazarDevolucion(estado: string): boolean {
  return ESTADO_MAYUSCULAS(estado) === 'SOLICITADA';
}

/** Solo APROBADA permite procesar (repone inventario y completa). */
export function puedeProcesarDevolucion(estado: string): boolean {
  return ESTADO_MAYUSCULAS(estado) === 'APROBADA';
}

/** Etiqueta del estado del listado para acciones contextuales. */
export function etiquetaEstadoDevolucion(estado: string): string {
  const valor = ESTADO_MAYUSCULAS(estado);
  return valor === 'APROBADA' ? 'Pendiente de procesar' : valor;
}


/** Línea vendida con su disponibilidad real (`DisponibilidadItemResponse`). */
export interface DisponibilidadItem {
  detalle_venta_id: number;
  inventario_id: number;
  producto_id: number;
  producto_nombre: string;
  sku: string;
  talla_nombre: string;
  color_nombre: string;
  cantidad_vendida: number;
  cantidad_comprometida: number;
  cantidad_disponible: number;
  /** Decimal normalizado a number solo para presentación. */
  precio_unitario: number;
}

/** Venta COMPLETADA lista para devolución (`DisponibilidadVentaResponse`). */
export interface DisponibilidadVenta {
  venta_id: number;
  fecha_hora: string;
  estado: string;
  canal: string;
  /** Decimal normalizado a number solo para presentación. */
  total: number;
  sucursal: DevolucionSucursal;
  cliente: DevolucionCliente | null;
  items: DisponibilidadItem[];
  cantidad_total_unidades: number;
}
