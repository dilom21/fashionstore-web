import {
  DetalleOrdenCompra,
  DetalleOrdenCompraInput,
  EstadoOrdenCompra,
  ETIQUETAS_ESTADO_ORDEN,
} from '../models/orden-compra.model';

/**
 * Utilidades puras de presentación para CU12.
 *
 * Reglas de visibilidad de acciones (el backend es la autoridad final):
 * - Editar cabecera: BORRADOR, ENVIADA y PARCIAL (PATCH permitido).
 * - Gestionar detalles: solo BORRADOR (PUT permitido); el resto es 409.
 * - Enviar: BORRADOR -> ENVIADA.
 * - Cancelar: BORRADOR y ENVIADA -> CANCELADA (Encargado recibe 403).
 * - Recibir: ENVIADA y PARCIAL -> RECIBIDA.
 */

/** true si el backend permite PATCH de la cabecera. */
export function puedeEditarCabecera(estado: EstadoOrdenCompra): boolean {
  return estado === 'BORRADOR' || estado === 'ENVIADA' || estado === 'PARCIAL';
}

/** true si el backend permite PUT de detalles (solo BORRADOR). */
export function puedeGestionarDetalles(estado: EstadoOrdenCompra): boolean {
  return estado === 'BORRADOR';
}

/** true si la orden puede enviarse. */
export function puedeEnviar(estado: EstadoOrdenCompra): boolean {
  return estado === 'BORRADOR';
}

/** true si la orden puede cancelarse (Encargado recibirá 403 real). */
export function puedeCancelar(estado: EstadoOrdenCompra): boolean {
  return estado === 'BORRADOR' || estado === 'ENVIADA';
}

/** true si la orden puede recibirse. */
export function puedeRecibir(estado: EstadoOrdenCompra): boolean {
  return estado === 'ENVIADA' || estado === 'PARCIAL';
}

/** true si el estado es final (solo lectura). */
export function esEstadoFinal(estado: EstadoOrdenCompra): boolean {
  return estado === 'RECIBIDA' || estado === 'CANCELADA';
}

/** Etiqueta legible de un estado. */
export function etiquetaEstado(estado: EstadoOrdenCompra): string {
  return ETIQUETAS_ESTADO_ORDEN[estado] ?? estado;
}

/** Subtotal visual de una línea (cantidad * costo unitario). */
export function calcularSubtotal(cantidad: number, costoUnitario: number): number {
  return (Number.isFinite(cantidad) ? cantidad : 0) * (Number.isFinite(costoUnitario) ? costoUnitario : 0);
}

/** Suma visual de subtotales de un conjunto de detalles. */
export function calcularTotal(detalles: readonly DetalleOrdenCompra[]): number {
  return detalles.reduce(
    (acumulado, detalle) =>
      acumulado + calcularSubtotal(detalle.cantidad, detalle.costo_unitario),
    0,
  );
}

/** Suma visual de subtotales de un conjunto de líneas editables. */
export function calcularTotalInputs(
  detalles: readonly DetalleOrdenCompraInput[],
): number {
  return detalles.reduce(
    (acumulado, detalle) =>
      acumulado + calcularSubtotal(detalle.cantidad, detalle.costo_unitario),
    0,
  );
}

/** Formatea una fecha `YYYY-MM-DD` (o ISO) a `DD/MM/AAAA` sin desfase horario. */
export function formatearFecha(valor: string | null | undefined): string {
  if (!valor) {
    return '—';
  }
  const soloFecha = valor.length >= 10 ? valor.slice(0, 10) : valor;
  const partes = soloFecha.split('-');
  if (partes.length === 3) {
    const [anio, mes, dia] = partes;
    return `${dia}/${mes}/${anio}`;
  }
  return valor;
}

/** Formatea un monto monetario con dos decimales. */
export function formatearMoneda(valor: number): string {
  const numero = Number.isFinite(valor) ? valor : 0;
  return numero.toFixed(2);
}

/** Fecha local de hoy en formato `YYYY-MM-DD`. */
export function hoyIso(): string {
  const ahora = new Date();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${ahora.getFullYear()}-${mes}-${dia}`;
}
