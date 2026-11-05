import { RecepcionLineaSolicitud } from '../../models/tenant.models';

/**
 * Utilidades puras de la recepción de mercadería (compras).
 *
 * Reglas del contrato `POST /tenant/ordenes-compra/{id}/recepciones`:
 * - `lineas` lleva entre 1 y 50 elementos.
 * - `cantidad` es un entero entre 1 y 100000.
 * - La pantalla captura un valor entre 0 y `cantidad_pendiente`; las líneas en
 *   0 se OMITEN del cuerpo (no se envían cantidades vacías).
 */

/** Máximo de líneas por recepción que acepta el backend. */
export const MAX_LINEAS_RECEPCION = 50;

/** Fila del formulario de recepción, tal como la maneja la UI. */
export interface LineaRecepcionEntrada {
  /** `id` de la línea de la orden (`detalle_orden_compra_id`). */
  detalle_orden_compra_id: number;
  /** Unidades aún pendientes según el backend. */
  pendiente: number;
  /** Cantidad escrita en el formulario; `null` = vacía. */
  cantidad: number | null;
}

/** Resultado de validar las cantidades a recibir. */
export interface LineasRecepcionValidadas {
  /** `true` solo si no hay errores y hay al menos una línea con cantidad > 0. */
  ok: boolean;
  /** Solo las líneas con cantidad > 0, listas para el cuerpo. */
  lineas: RecepcionLineaSolicitud[];
  /** Mensaje por índice de fila (clave `String(indice)`). */
  errores: Record<string, string>;
  /** Error de la tabla completa (sin líneas o ninguna cantidad). */
  mensajeGeneral: string | null;
}

/**
 * Valida y normaliza las cantidades del formulario de recepción.
 *
 * No descarta filas con datos inválidos en silencio: cada problema se devuelve
 * con el índice de la fila para marcar el campo exacto. Las filas vacías o en 0
 * son válidas y simplemente no viajan en el cuerpo.
 */
export function construirLineasRecepcion(
  entradas: readonly LineaRecepcionEntrada[],
  maximoLineas: number = MAX_LINEAS_RECEPCION,
): LineasRecepcionValidadas {
  if (entradas.length === 0) {
    return {
      ok: false,
      lineas: [],
      errores: {},
      mensajeGeneral: 'La orden no tiene líneas pendientes de recepción.',
    };
  }

  if (entradas.length > maximoLineas) {
    return {
      ok: false,
      lineas: [],
      errores: {},
      mensajeGeneral: `Una recepción admite como máximo ${maximoLineas} líneas.`,
    };
  }

  const lineas: RecepcionLineaSolicitud[] = [];
  const errores: Record<string, string> = {};

  entradas.forEach((entrada, indice) => {
    const cantidad = entrada.cantidad;

    // Vacía o 0: la línea no se recibe en esta operación.
    if (cantidad === null || cantidad === 0) {
      return;
    }

    const pendiente = entrada.pendiente;
    if (pendiente <= 0) {
      errores[String(indice)] = 'La línea no tiene unidades pendientes.';
      return;
    }
    const valida =
      Number.isInteger(cantidad) && cantidad >= 1 && cantidad <= pendiente;

    if (!valida) {
      errores[String(indice)] =
        `La cantidad debe ser un entero entre 1 y ${pendiente}.`;
      return;
    }

    lineas.push({
      detalle_orden_compra_id: entrada.detalle_orden_compra_id,
      cantidad,
    });
  });

  const hayErrores = Object.keys(errores).length > 0;

  if (!hayErrores && lineas.length === 0) {
    return {
      ok: false,
      lineas: [],
      errores,
      mensajeGeneral:
        'Indica al menos una cantidad mayor que 0 para recibir mercadería.',
    };
  }

  return {
    ok: !hayErrores,
    lineas,
    errores,
    mensajeGeneral: null,
  };
}
