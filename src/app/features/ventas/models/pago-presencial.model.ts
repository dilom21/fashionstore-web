/**
 * Modelos del dominio Pagos presenciales (CU21 - Registrar pago presencial).
 *
 * Los nombres coinciden EXACTAMENTE con el JSON real del backend FastAPI:
 *
 *   POST /pagos/presencial
 *   -> app/modules/pagos/schemas/schemas.py
 *      (MetodoPago / RegistrarPagoPresencialRequest / PagoPresencialResponse)
 *
 * El frontend NUNCA envía `monto`, `estado`, `empleado_id`, `sucursal_id`,
 * `canal`, `pasarela` ni `referencia_transaccion`: los determina el backend.
 * CU21 no integra Stripe (eso corresponde a CU22).
 */

/**
 * Valores exactos del CHECK real `ck_pago_metodo` de la tabla `pago`.
 *
 * No inventar otros valores.
 */
export type MetodoPagoPresencial =
  | 'EFECTIVO'
  | 'TARJETA'
  | 'TRANSFERENCIA'
  | 'QR'
  | 'OTRO';

/** Opción presentable del selector de método (etiqueta -> valor real). */
export interface OpcionMetodoPagoPresencial {
  valor: MetodoPagoPresencial;
  etiqueta: string;
}

/**
 * Catálogo de métodos reales de CU21.
 *
 * El orden y las etiquetas son de presentación; el valor enviado es el que
 * admite la base de datos.
 */
export const METODOS_PAGO_PRESENCIAL: readonly OpcionMetodoPagoPresencial[] = [
  { valor: 'EFECTIVO', etiqueta: 'Efectivo' },
  { valor: 'TARJETA', etiqueta: 'Tarjeta' },
  { valor: 'TRANSFERENCIA', etiqueta: 'Transferencia' },
  { valor: 'QR', etiqueta: 'QR' },
  { valor: 'OTRO', etiqueta: 'Otro' },
];

/**
 * Cuerpo de POST /pagos/presencial (RegistrarPagoPresencialRequest).
 *
 * Solo `venta_id` + `metodo`. El backend deriva el monto (venta.total), el
 * estado (APROBADO), la sucursal y el empleado.
 */
export interface RegistrarPagoPresencialRequest {
  venta_id: number;
  metodo: MetodoPagoPresencial;
}

/**
 * Resultado del pago aprobado y de la confirmación de la venta
 * (PagoPresencialResponse).
 *
 * `monto` llega como Decimal serializado: se normaliza a number solo para
 * presentación (no se recalcula). `estado_venta` y `estado_reserva` son la
 * autoridad del backend; el frontend no los hardcodea.
 */
export interface PagoPresencialResponse {
  pago_id: number;
  venta_id: number;
  metodo: string;
  estado_pago: string;
  monto: number;
  fecha: string;
  estado_venta: string;
  reserva_id: number | null;
  estado_reserva: string | null;
}

/** Etiqueta legible de un método real, o el propio valor si no se reconoce. */
export function etiquetaMetodoPago(metodo: string): string {
  const valor = (metodo ?? '').trim().toUpperCase();
  const opcion = METODOS_PAGO_PRESENCIAL.find((m) => m.valor === valor);
  return opcion?.etiqueta ?? valor;
}
