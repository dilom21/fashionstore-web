/**
 * Modelos y normalizadores del carrito SaaS (CU15 multitenant).
 *
 * Contrato REAL de FastAPI (`app/modules/carrito/api/`):
 *  - POST   /tenant/carritos/items
 *  - GET    /tenant/carritos?limit=50&offset=0
 *  - GET    /tenant/carritos/{carrito_id}
 *  - PATCH  /tenant/carritos/{carrito_id}/items/{detalle_id}
 *  - DELETE /tenant/carritos/{carrito_id}/items/{detalle_id}
 *  - DELETE /tenant/carritos/{carrito_id}
 *
 * Diferencias frente al contrato legacy (primer parcial):
 *  - El alta acepta `variante_producto_id` + `temporada_id` (el backend resuelve
 *    el `inventario_id`; Angular NUNCA lo calcula).
 *  - Las mutaciones PATCH/DELETE devuelven una línea o un estado, NO el detalle
 *    completo (`CarritoDetalleSaaS`).
 *  - `ItemCarritoSaaS` NO incluye `imagen_principal`.
 *  - Los importes Decimal llegan como cadena y se normalizan a número.
 *
 * El `empresa_id`, `cliente_id` y cualquier id de contexto los obtiene FastAPI
 * del JWT tenant: aquí nunca se envían.
 */
import { CarritoDetalle, CarritoItem, CarritoListaResponse, CarritoResumen } from './carrito.model';

/** Cuerpo SaaS de POST /tenant/carritos/items (contrato por variante + temporada). */
export interface AgregarItemSaasPayload {
  sucursal_id: number;
  variante_producto_id: number;
  temporada_id: number;
  cantidad: number;
}

/** Cuerpo de PATCH /tenant/carritos/{carrito_id}/items/{detalle_id}. */
export interface ActualizarCantidadSaasPayload {
  cantidad: number;
}

/** Respuesta de POST/PATCH de una línea del carrito SaaS. */
export interface CarritoItemTenantResponse {
  carrito_id: number;
  detalle_id: number;
  inventario_id: number;
  cantidad: number;
  estado: string;
}

/** Respuesta de DELETE (línea o carrito) del carrito SaaS. */
export interface EstadoCarritoTenantResponse {
  carrito_id: number;
  estado: string;
  cantidad_lineas: number;
}

// ===== Esquemas "wire" de lectura SaaS =====

export interface CarritoResumenSaasCrudo {
  carrito_id: number;
  sucursal_id: number;
  sucursal_nombre: string;
  cantidad_lineas: number;
  cantidad_unidades: number;
  subtotal: string | number;
  fecha_actualizacion: string;
}

export interface ListaCarritosSaasCrudo {
  items: CarritoResumenSaasCrudo[];
  total_carritos_activos: number;
}

export interface ItemCarritoSaasCrudo {
  detalle_id: number;
  inventario_id: number;
  producto_id: number;
  producto_nombre: string;
  precio_unitario: string | number;
  /** Imagen principal resuelta por la API SaaS (puede ser null). */
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
  stock_disponible: number;
  subtotal_linea: string | number;
}

export interface CarritoDetalleSaasCrudo {
  carrito_id: number;
  sucursal_id: number;
  sucursal_nombre: string;
  estado: string;
  fecha_creacion: string;
  fecha_actualizacion: string;
  items: ItemCarritoSaasCrudo[];
  cantidad_total_unidades: number;
  subtotal_carrito: string | number;
}

// ===== Normalizadores (puros) =====

function numero(valor: unknown): number {
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    return valor;
  }
  if (typeof valor === 'string') {
    const convertido = Number(valor);
    return Number.isFinite(convertido) ? convertido : 0;
  }
  return 0;
}

function entero(valor: unknown): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : 0;
}

function cadena(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

/** Normaliza un resumen SaaS al modelo interno compartido. */
export function normalizarResumenSaas(crudo: unknown): CarritoResumen {
  const objeto = (crudo ?? {}) as Record<string, unknown>;
  return {
    carrito_id: entero(objeto['carrito_id']),
    sucursal_id: entero(objeto['sucursal_id']),
    sucursal_nombre: cadena(objeto['sucursal_nombre']),
    cantidad_lineas: entero(objeto['cantidad_lineas']),
    cantidad_unidades: entero(objeto['cantidad_unidades']),
    subtotal: numero(objeto['subtotal']),
    fecha_actualizacion: cadena(objeto['fecha_actualizacion']),
  };
}

/** Normaliza la respuesta de GET /tenant/carritos. */
export function normalizarListaSaas(crudo: unknown): CarritoListaResponse {
  const objeto = (crudo ?? {}) as { items?: unknown; total_carritos_activos?: unknown };
  const items = Array.isArray(objeto.items)
    ? objeto.items.map(normalizarResumenSaas)
    : [];
  return {
    items,
    total_carritos_activos: entero(objeto.total_carritos_activos),
  };
}

/** Normaliza una línea SaaS al modelo interno compartido. */
export function normalizarItemSaas(crudo: unknown): CarritoItem {
  const objeto = (crudo ?? {}) as Record<string, unknown>;
  const imagen = cadena(objeto['imagen_principal_url']).trim();
  return {
    detalle_id: entero(objeto['detalle_id']),
    inventario_id: entero(objeto['inventario_id']),
    producto_id: entero(objeto['producto_id']),
    producto_nombre: cadena(objeto['producto_nombre']),
    precio_unitario: numero(objeto['precio_unitario']),
    // La API SaaS entrega `imagen_principal_url`; si es null se mantiene el
    // placeholder del componente (no se inventan URLs).
    imagen_principal: imagen.length > 0 ? imagen : null,
    variante_producto_id: entero(objeto['variante_producto_id']),
    sku: cadena(objeto['sku']),
    talla_id: entero(objeto['talla_id']),
    talla_nombre: cadena(objeto['talla_nombre']),
    color_id: entero(objeto['color_id']),
    color_nombre: cadena(objeto['color_nombre']),
    temporada_id: entero(objeto['temporada_id']),
    temporada_nombre: cadena(objeto['temporada_nombre']),
    cantidad: entero(objeto['cantidad']),
    stock_disponible: entero(objeto['stock_disponible']),
    subtotal_linea: numero(objeto['subtotal_linea']),
  };
}

/** Normaliza el detalle SaaS al modelo interno compartido. */
export function normalizarDetalleSaas(crudo: unknown): CarritoDetalle {
  const objeto = (crudo ?? {}) as Record<string, unknown>;
  return {
    carrito_id: entero(objeto['carrito_id']),
    sucursal_id: entero(objeto['sucursal_id']),
    sucursal_nombre: cadena(objeto['sucursal_nombre']),
    estado: cadena(objeto['estado']),
    fecha_creacion: cadena(objeto['fecha_creacion']),
    fecha_actualizacion: cadena(objeto['fecha_actualizacion']),
    items: Array.isArray(objeto['items'])
      ? objeto['items'].map(normalizarItemSaas)
      : [],
    cantidad_total_unidades: entero(objeto['cantidad_total_unidades']),
    subtotal_carrito: numero(objeto['subtotal_carrito']),
  };
}
