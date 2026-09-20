/**
 * Modelos del dominio Pagos electrónicos (CU22 - Procesar pago con Stripe).
 *
 * Los nombres coinciden EXACTAMENTE con el contrato real del backend FastAPI:
 *
 *   POST /pagos/stripe/intencion
 *   GET  /pagos/stripe/ventas/{venta_id}/estado
 *   -> app/modules/pagos/schemas/electronico.py
 *      (CrearIntencionPagoRequest / IntencionPagoResponse / EstadoPagoVentaResponse)
 *
 * El frontend NUNCA envía `amount`, `currency`, `cliente_id`, `estado` ni
 * `metodo`: el backend los deriva de la venta. El webhook firmado es la ÚNICA
 * autoridad que confirma la venta; Stripe.js no decide el resultado.
 */

/**
 * Cuerpo de POST /pagos/stripe/intencion (CrearIntencionPagoRequest).
 *
 * Solo `venta_id`. El backend valida que la venta sea del cliente autenticado,
 * sea WEB/MOVIL y esté PENDIENTE.
 */
export interface CrearIntencionPagoRequest {
  venta_id: number;
}

/**
 * Respuesta de POST /pagos/stripe/intencion (IntencionPagoResponse).
 *
 * `monto` llega como Decimal serializado: se normaliza a number solo para
 * presentación (no se recalcula). `client_secret` se mantiene SOLO en memoria
 * y nunca se persiste ni se loggea.
 */
export interface IntencionPagoResponse {
  venta_id: number;
  pago_id: number;
  payment_intent_id: string;
  client_secret: string | null;
  monto: number;
  moneda: string;
  estado_pago: string;
}

/**
 * Respuesta de GET /pagos/stripe/ventas/{venta_id}/estado
 * (EstadoPagoVentaResponse).
 *
 * Refleja el estado real persistido por el backend tras procesar el webhook.
 * Es la autoridad de negocio: la UI no confía en el callback de Stripe.js.
 */
export interface EstadoPagoVentaResponse {
  venta_id: number;
  estado_venta: string;
  pago_id: number | null;
  estado_pago: string | null;
  payment_intent_id: string | null;
  /**
   * Campo ADITIVO/opcional agregado por el backend para la compensación de
   * Stripe. Nunca es la fuente principal: `estado_venta` + `estado_pago`
   * mandan. Puede venir null o no venir.
   */
  compensacion_estado?: string | null;
}

/** Estados reales del pago (app/modules/pagos/repositories/stripe_repository). */
export const ESTADO_PAGO_PENDIENTE = 'PENDIENTE';
export const ESTADO_PAGO_APROBADO = 'APROBADO';
export const ESTADO_PAGO_RECHAZADO = 'RECHAZADO';
export const ESTADO_PAGO_ANULADO = 'ANULADO';
export const ESTADO_PAGO_REEMBOLSADO = 'REEMBOLSADO';

/** Estado de venta PENDIENTE (aún no confirmada por el webhook). */
export const ESTADO_VENTA_PENDIENTE = 'PENDIENTE';

/** Estado de venta cancelada (compensación/reembolso de Stripe). */
export const ESTADO_VENTA_CANCELADA = 'CANCELADA';

/** Estados de venta finales/confirmados (post sp_confirmar_venta). */
export const ESTADOS_VENTA_CONFIRMADA: readonly string[] = [
  'COMPLETADA',
  'PAGADA',
];

/**
 * Estado visual único de la venta + pago. Centraliza la interpretación para que
 * ninguna vista vuelva a combinar estados por su cuenta.
 *
 * Regla crítica: `pago = APROBADO` NO es éxito si `venta = CANCELADA`.
 */
export type EstadoVisualPago =
  | 'EXITO'
  | 'RECHAZADO'
  | 'ANULADO'
  | 'EN_CONFIRMACION'
  | 'REEMBOLSO_EN_PROCESO'
  | 'REEMBOLSADO'
  | 'DESCONOCIDO';

/**
 * Mapper central de estados (única autoridad de interpretación en el cliente).
 *
 * Orden de prioridad:
 *   1. CANCELADA + REEMBOLSADO        -> REEMBOLSADO
 *   2. CANCELADA + APROBADO           -> REEMBOLSO_EN_PROCESO
 *   3. CANCELADA (cualquier otro pago)-> REEMBOLSO_EN_PROCESO (seguro, sin cobro)
 *   4. COMPLETADA/PAGADA              -> EXITO
 *   5. pago RECHAZADO                 -> RECHAZADO
 *   6. pago ANULADO                   -> ANULADO
 *   7. PENDIENTE + PENDIENTE          -> EN_CONFIRMACION
 *   8. combinación desconocida        -> DESCONOCIDO (seguro, sin cobro)
 *
 * `compensacion_estado` solo se usa como ayuda: si el backend ya reportó el
 * reembolso completado, se promueve a REEMBOLSADO aunque el pago aún no se
 * haya actualizado.
 */
export function mapearEstadoVisualPago(estado: {
  estado_venta: string | null | undefined;
  estado_pago: string | null | undefined;
  compensacion_estado?: string | null | undefined;
}): EstadoVisualPago {
  const venta = normalizarEstado(estado.estado_venta);
  const pago = normalizarEstado(estado.estado_pago);
  const compensacion = normalizarEstado(estado.compensacion_estado);

  const ventaCancelada = venta === ESTADO_VENTA_CANCELADA;
  const pagoReembolsado =
    pago === ESTADO_PAGO_REEMBOLSADO || compensacionReembolsada(compensacion);

  // 1. Compensación completada: estado terminal.
  if (ventaCancelada && pagoReembolsado) {
    return 'REEMBOLSADO';
  }

  // 2 y 3. Venta cancelada sin reembolso confirmado: la compra no se completó
  // y no debe volver a cobrarse. Nunca es EXITO aunque el pago esté APROBADO.
  if (ventaCancelada) {
    return 'REEMBOLSO_EN_PROCESO';
  }

  // 4. Venta confirmada.
  if (esVentaConfirmada(venta)) {
    return 'EXITO';
  }

  // 5. Rechazo.
  if (pago === ESTADO_PAGO_RECHAZADO) {
    return 'RECHAZADO';
  }

  // 6. Anulación.
  if (pago === ESTADO_PAGO_ANULADO) {
    return 'ANULADO';
  }

  // Pago aprobado pero venta aún no finalizada (sp_confirmar_venta en curso):
  // no es éxito todavía y el webhook puede seguir trabajando.
  if (pago === ESTADO_PAGO_APROBADO) {
    return 'EN_CONFIRMACION';
  }

  // 7. Espera normal del webhook.
  if (venta === ESTADO_VENTA_PENDIENTE && pago === ESTADO_PAGO_PENDIENTE) {
    return 'EN_CONFIRMACION';
  }

  // 8. Estado seguro: nunca habilita un nuevo cobro.
  return 'DESCONOCIDO';
}

/** true si `compensacion_estado` indica reembolso completado. */
export function compensacionReembolsada(
  compensacion: string | null | undefined,
): boolean {
  const valor = normalizarEstado(compensacion);
  return valor === 'REEMBOLSADO' || valor === 'REEMBOLSO_COMPLETADO';
}

/**
 * true si el estado visual permite (re)intentar un cobro. Solo un rechazo o una
 * anulación de una venta no cancelada habilitan el CTA de pago.
 */
export function permiteReintentarPago(estadoVisual: EstadoVisualPago): boolean {
  return estadoVisual === 'RECHAZADO' || estadoVisual === 'ANULADO';
}

/** true si el estado visual es terminal (no tiene sentido seguir consultando). */
export function esEstadoVisualTerminal(estadoVisual: EstadoVisualPago): boolean {
  return estadoVisual !== 'EN_CONFIRMACION';
}

/** Normaliza un estado del backend a mayúsculas sin espacios. */
export function normalizarEstado(valor: string | null | undefined): string {
  return (valor ?? '').trim().toUpperCase();
}

/** true si el pago está APROBADO (webhook ya procesado). */
export function esPagoAprobado(estadoPago: string | null | undefined): boolean {
  return normalizarEstado(estadoPago) === ESTADO_PAGO_APROBADO;
}

/** true si la venta llegó a un estado final confirmado. */
export function esVentaConfirmada(
  estadoVenta: string | null | undefined,
): boolean {
  return ESTADOS_VENTA_CONFIRMADA.includes(normalizarEstado(estadoVenta));
}

/**
 * true si el pago está en un estado terminal (no tiene sentido seguir
 * consultando). PENDIENTE no es terminal: el webhook puede seguir en camino.
 */
export function esEstadoPagoTerminal(
  estadoPago: string | null | undefined,
): boolean {
  const estado = normalizarEstado(estadoPago);
  return (
    estado === ESTADO_PAGO_APROBADO ||
    estado === ESTADO_PAGO_RECHAZADO ||
    estado === ESTADO_PAGO_ANULADO
  );
}

/** Etiqueta legible de una moneda ISO devuelta por el backend. */
export function etiquetaMoneda(moneda: string | null | undefined): string {
  const valor = (moneda ?? '').trim().toUpperCase();
  switch (valor) {
    case 'BOB':
      return 'Bs';
    case 'USD':
      return 'US$';
    case 'EUR':
      return '€';
    default:
      return valor;
  }
}
