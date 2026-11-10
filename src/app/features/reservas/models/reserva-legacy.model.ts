/**
 * Contrato LEGACY de reservas (primer parcial) y normalizadores al modelo
 * interno de `reserva.model.ts`.
 *
 * Se conserva intacto el comportamiento cuando `saasMode=false`. El único
 * cambio es la normalización explícita para que las páginas compartan tipos con
 * el modo SaaS.
 */
import {
  EstadoReserva,
  ReservaDetalle,
  ReservaEstado,
  ReservaItem,
  ReservaListaResponse,
  ReservaResumen,
} from './reserva.model';

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

/** Resumen legacy -> interno. Descarta `cliente_id` (no se usa en UI). */
export function normalizarResumenReservaLegacy(
  crudo: unknown,
): ReservaResumen {
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

/** Línea legacy -> interna. `imagen_principal` pasa a `imagen_principal_url`. */
export function normalizarItemReservaLegacy(crudo: unknown): ReservaItem {
  const objeto = objetoDe(crudo);
  return {
    detalle_id: entero(objeto['detalle_id']),
    inventario_id: entero(objeto['inventario_id']),
    producto_id: entero(objeto['producto_id']),
    producto_nombre: cadena(objeto['producto_nombre']),
    imagen_principal_url:
      cadenaONull(objeto['imagen_principal_url']) ??
      cadenaONull(objeto['imagen_principal']),
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

/** Detalle legacy -> interno. `cantidad_total_unidades` -> `cantidad_unidades`. */
export function normalizarDetalleReservaLegacy(
  crudo: unknown,
): ReservaDetalle {
  const objeto = objetoDe(crudo);
  const resumen = normalizarResumenReservaLegacy(objeto);
  return {
    ...resumen,
    cantidad_unidades:
      resumen.cantidad_unidades || entero(objeto['cantidad_total_unidades']),
    items: Array.isArray(objeto['items'])
      ? objeto['items'].map(normalizarItemReservaLegacy)
      : [],
  };
}

/** Lista legacy `{items, total_reservas}` -> interno paginado. */
export function normalizarListaReservaLegacy(
  crudo: unknown,
): ReservaListaResponse {
  const objeto = objetoDe(crudo);
  const items = Array.isArray(objeto['items'])
    ? objeto['items'].map(normalizarResumenReservaLegacy)
    : [];
  return {
    items,
    total:
      typeof objeto['total_reservas'] === 'number'
        ? objeto['total_reservas']
        : items.length,
    // El contrato legacy no pagina: se expone el total como una sola página.
    limit: items.length,
    offset: 0,
  };
}

/** Detalle legacy (respuesta de crear/cancelar) -> resultado de estado. */
export function normalizarEstadoReservaLegacy(crudo: unknown): ReservaEstado {
  const objeto = objetoDe(crudo);
  return {
    reserva_id: entero(objeto['reserva_id']),
    estado: cadena(objeto['estado']),
  };
}
