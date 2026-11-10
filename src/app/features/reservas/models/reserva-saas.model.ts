/**
 * Contrato REAL de reservas SaaS (`/tenant/reservas`) y normalizadores.
 *
 * Verificado en el backend FastAPI:
 *  - POST /tenant/reservas/prevalidar -> PrevalidacionReserva (NO crea nada)
 *  - POST /tenant/reservas            -> {reserva_id, carrito_id, estado}
 *  - GET  /tenant/reservas?limit&offset&estado -> {items, total, limit, offset}
 *  - GET  /tenant/reservas/{id}       -> detalle con items[]
 *  - PATCH /tenant/reservas/{id}/cancelar -> {reserva_id, estado}
 *
 * Los importes/fechas y las líneas se normalizan a los modelos internos de
 * `reserva.model.ts`. El backend obtiene empresa y cliente del JWT tenant.
 */
import {
  EstadoReserva,
  PrevalidacionReserva,
  ReservaDetalle,
  ReservaEstado,
  ReservaItem,
  ReservaListaResponse,
  ReservaResumen,
} from './reserva.model';

// ===== Schemas "wire" SaaS =====

export interface PrevalidacionReservaSaasCrudo {
  carrito_id: number;
  sucursal_id: number;
  fecha_atencion: string;
  cantidad_lineas: number;
  cantidad_unidades: number;
  stock_verificado_preliminarmente: boolean;
  reserva_creada: boolean;
  requiere_verificacion_transaccional: boolean;
}

export interface ReservaCreadaSaasCrudo {
  reserva_id: number;
  carrito_id: number;
  estado: string;
}

export interface ReservaEstadoSaasCrudo {
  reserva_id: number;
  estado: string;
}

export interface ReservaResumenSaasCrudo {
  reserva_id: number;
  carrito_id: number | null;
  sucursal_id: number;
  sucursal_nombre: string;
  fecha_reserva: string;
  fecha_atencion: string;
  estado: string;
  observacion: string | null;
  cantidad_lineas: number;
  cantidad_unidades: number;
}

export interface ReservaListaSaasCrudo {
  items: ReservaResumenSaasCrudo[];
  total: number;
  limit: number;
  offset: number;
}

export interface ReservaItemSaasCrudo {
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

export interface ReservaDetalleSaasCrudo extends ReservaResumenSaasCrudo {
  items: ReservaItemSaasCrudo[];
}

// ===== Utilidades =====

function entero(valor: unknown): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : 0;
}

function cadena(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

function cadenaONull(valor: unknown): string | null {
  if (typeof valor !== 'string') {
    return null;
  }
  const texto = valor.trim();
  return texto.length > 0 ? texto : null;
}

function objetoDe(valor: unknown): Record<string, unknown> {
  return (valor ?? {}) as Record<string, unknown>;
}

// ===== Normalizadores SaaS =====

export function normalizarPrevalidacionSaas(
  crudo: unknown,
): PrevalidacionReserva {
  const objeto = objetoDe(crudo);
  return {
    carrito_id: entero(objeto['carrito_id']),
    sucursal_id: entero(objeto['sucursal_id']),
    fecha_atencion: cadena(objeto['fecha_atencion']),
    cantidad_lineas: entero(objeto['cantidad_lineas']),
    cantidad_unidades: entero(objeto['cantidad_unidades']),
    stock_verificado_preliminarmente:
      objeto['stock_verificado_preliminarmente'] === true,
    // El backend devuelve siempre false: la prevalidación no crea la reserva.
    reserva_creada: objeto['reserva_creada'] === true,
    requiere_verificacion_transaccional:
      objeto['requiere_verificacion_transaccional'] === true,
  };
}

export function normalizarResumenReservaSaas(crudo: unknown): ReservaResumen {
  const objeto = objetoDe(crudo);
  return {
    reserva_id: entero(objeto['reserva_id']),
    carrito_id:
      typeof objeto['carrito_id'] === 'number' ? objeto['carrito_id'] : null,
    sucursal_id: entero(objeto['sucursal_id']),
    sucursal_nombre: cadena(objeto['sucursal_nombre']),
    fecha_reserva: cadena(objeto['fecha_reserva']),
    fecha_atencion: cadena(objeto['fecha_atencion']),
    estado: cadena(objeto['estado']) as EstadoReserva,
    observacion: cadenaONull(objeto['observacion']),
    cantidad_lineas: entero(objeto['cantidad_lineas']),
    cantidad_unidades: entero(objeto['cantidad_unidades']),
  };
}

export function normalizarItemReservaSaas(crudo: unknown): ReservaItem {
  const objeto = objetoDe(crudo);
  return {
    detalle_id: entero(objeto['detalle_id']),
    inventario_id: entero(objeto['inventario_id']),
    producto_id: entero(objeto['producto_id']),
    producto_nombre: cadena(objeto['producto_nombre']),
    imagen_principal_url: cadenaONull(objeto['imagen_principal_url']),
    variante_producto_id: entero(objeto['variante_producto_id']),
    sku: cadena(objeto['sku']),
    talla_id: entero(objeto['talla_id']),
    talla_nombre: cadena(objeto['talla_nombre']),
    color_id: entero(objeto['color_id']),
    color_nombre: cadena(objeto['color_nombre']),
    temporada_id: entero(objeto['temporada_id']),
    temporada_nombre: cadena(objeto['temporada_nombre']),
    cantidad: entero(objeto['cantidad']),
  };
}

export function normalizarDetalleReservaSaas(crudo: unknown): ReservaDetalle {
  const objeto = objetoDe(crudo);
  return {
    ...normalizarResumenReservaSaas(objeto),
    items: Array.isArray(objeto['items'])
      ? objeto['items'].map(normalizarItemReservaSaas)
      : [],
  };
}

export function normalizarListaReservaSaas(
  crudo: unknown,
): ReservaListaResponse {
  const objeto = objetoDe(crudo);
  const items = Array.isArray(objeto['items'])
    ? objeto['items'].map(normalizarResumenReservaSaas)
    : [];
  return {
    items,
    total: entero(objeto['total']),
    limit: entero(objeto['limit']),
    offset: entero(objeto['offset']),
  };
}

export function normalizarReservaCreadaSaas(crudo: unknown): {
  reserva_id: number;
  carrito_id: number | null;
  estado: string;
} {
  const objeto = objetoDe(crudo);
  return {
    reserva_id: entero(objeto['reserva_id']),
    carrito_id:
      typeof objeto['carrito_id'] === 'number' ? objeto['carrito_id'] : null,
    estado: cadena(objeto['estado']),
  };
}

export function normalizarReservaEstadoSaas(crudo: unknown): ReservaEstado {
  const objeto = objetoDe(crudo);
  return {
    reserva_id: entero(objeto['reserva_id']),
    estado: cadena(objeto['estado']),
  };
}
