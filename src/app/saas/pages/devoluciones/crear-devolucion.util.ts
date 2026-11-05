import {
  DevolucionCrear,
  DevolucionItemCrear,
} from '../../models/tenant.models';

/**
 * Utilidades puras del alta de devolución (`POST /tenant/devoluciones`).
 *
 * Reglas del contrato (`extra=forbid`):
 * - `motivo` general obligatorio (1..255) y `observacion` hasta 2000.
 * - `items` lleva entre 1 y 50 elementos.
 * - `cantidad` es un entero entre 1 y `cantidad_disponible_devolver`.
 * - `operacion_id` es el UUID de idempotencia.
 */

/** Máximo de ítems por devolución que acepta el backend. */
export const MAX_LINEAS_DEVOLUCION = 50;

/** Máximo del motivo general y del motivo de cada ítem. */
export const MAX_MOTIVO_DEVOLUCION = 255;

/** Máximo de la observación general (backend: 2000). */
export const MAX_OBSERVACION_DEVOLUCION = 2000;

/** Campo del ítem que produjo el error. */
export type CampoItemDevolucion = 'cantidad' | 'motivo';

/** Fila del formulario de devolución, tal como la maneja la UI. */
export interface LineaDevolucionEntrada {
  /** `detalle_venta_id` real devuelto por el backend. */
  detalle_venta_id: number;
  /** `cantidad_disponible_devolver` de la línea de venta. */
  disponible: number;
  /** Cantidad escrita en el formulario; `null` = vacía (no se devuelve). */
  cantidad: number | null;
  reponer: boolean;
  /** Motivo opcional del ítem. */
  motivo: string;
}

/** Error de validación asociado a una fila concreta. */
export interface ErrorItemDevolucion {
  indice: number;
  campo: CampoItemDevolucion;
  mensaje: string;
}

/** Resultado de validar los ítems de la devolución. */
export interface ItemsDevolucionValidados {
  ok: boolean;
  items: DevolucionItemCrear[];
  errores: ErrorItemDevolucion[];
  mensajeGeneral: string | null;
}

/** Datos ya validados por la pantalla antes de construir el cuerpo. */
export interface DatosDevolucion {
  ventaId: number;
  motivo: string;
  observacion: string;
  operacionId: string;
  items: readonly DevolucionItemCrear[];
}

/**
 * Valida y normaliza los ítems del formulario.
 *
 * Las filas con cantidad vacía o 0 no se devuelven en esta operación y no
 * generan error (la UI las deshabilita cuando no hay unidades disponibles).
 */
export function validarItemsDevolucion(
  entradas: readonly LineaDevolucionEntrada[],
  maximoItems: number = MAX_LINEAS_DEVOLUCION,
): ItemsDevolucionValidados {
  if (entradas.length === 0) {
    return {
      ok: false,
      items: [],
      errores: [],
      mensajeGeneral: 'Carga las líneas de una venta antes de crear la devolución.',
    };
  }

  if (entradas.length > maximoItems) {
    return {
      ok: false,
      items: [],
      errores: [],
      mensajeGeneral: `Una devolución admite como máximo ${maximoItems} ítems.`,
    };
  }

  const items: DevolucionItemCrear[] = [];
  const errores: ErrorItemDevolucion[] = [];

  entradas.forEach((entrada, indice) => {
    const cantidad = entrada.cantidad;
    const motivo = (entrada.motivo ?? '').trim();

    if (motivo.length > MAX_MOTIVO_DEVOLUCION) {
      errores.push({
        indice,
        campo: 'motivo',
        mensaje: `El motivo del ítem admite como máximo ${MAX_MOTIVO_DEVOLUCION} caracteres.`,
      });
    }

    if (cantidad === null || cantidad === 0) {
      return;
    }

    const disponible = Math.max(0, entrada.disponible);
    if (disponible <= 0) {
      errores.push({
        indice,
        campo: 'cantidad',
        mensaje: 'La línea no tiene unidades disponibles para devolver.',
      });
      return;
    }
    if (
      !Number.isInteger(cantidad) ||
      cantidad < 1 ||
      cantidad > disponible
    ) {
      errores.push({
        indice,
        campo: 'cantidad',
        mensaje: `La cantidad debe ser un entero entre 1 y ${disponible}.`,
      });
      return;
    }

    const item: DevolucionItemCrear = {
      detalle_venta_id: entrada.detalle_venta_id,
      cantidad,
      reponer: entrada.reponer,
    };
    if (motivo.length > 0) {
      item.motivo = motivo;
    }
    items.push(item);
  });

  const hayErrores = errores.length > 0;
  if (!hayErrores && items.length === 0) {
    return {
      ok: false,
      items: [],
      errores,
      mensajeGeneral:
        'Indica al menos una cantidad mayor que 0 para registrar la devolución.',
    };
  }

  return {
    ok: !hayErrores && items.length > 0,
    items,
    errores,
    mensajeGeneral: null,
  };
}

/**
 * Construye el cuerpo EXACTO de `POST /tenant/devoluciones`.
 *
 * Omite `observacion` cuando queda vacía (el contrato la admite ausente).
 */
export function construirDevolucion(
  datos: DatosDevolucion,
): DevolucionCrear {
  const dto: DevolucionCrear = {
    venta_id: datos.ventaId,
    motivo: datos.motivo.trim(),
    operacion_id: datos.operacionId,
    items: datos.items.map((item) => ({ ...item })),
  };
  const observacion = datos.observacion.trim();
  if (observacion.length > 0) {
    dto.observacion = observacion;
  }
  return dto;
}
