import {
  OrdenCompraCrear,
  OrdenCompraLineaCrear,
} from '../../models/tenant.models';

/**
 * Utilidades puras del alta de orden de compra (`POST /tenant/ordenes-compra`).
 *
 * Reglas del contrato (`extra=forbid`):
 * - `lineas` lleva entre 1 y 50 elementos.
 * - `cantidad` es un entero entre 1 y 100000.
 * - `costo_unitario` es decimal ≥ 0 con hasta 12 dígitos y 2 decimales.
 * - `fecha_estimada` es opcional (`datetime | null`).
 */

/** Máximo de líneas por orden que acepta el backend. */
export const MAX_LINEAS_ORDEN_COMPRA = 50;

/** Máximo de unidades por línea que acepta el backend. */
export const MAX_CANTIDAD_ORDEN_COMPRA = 100000;

/** Máximo de la observación general (backend: 2000). */
export const MAX_OBSERVACION_ORDEN_COMPRA = 2000;

/**
 * Costo aceptado por el formulario: hasta 10 dígitos enteros y 2 decimales.
 * Se admite coma o punto como separador decimal.
 */
const PATRON_COSTO = /^\d{1,10}(?:[.,]\d{1,2})?$/;

/** Campo de la línea que produjo el error. */
export type CampoLineaOrdenCompra =
  | 'variante_producto_id'
  | 'temporada_id'
  | 'cantidad'
  | 'costo_unitario';

/** Fila del formulario, tal como la maneja la UI (puede estar incompleta). */
export interface LineaOrdenCompraEntrada {
  variante_producto_id: number | null;
  temporada_id: number | null;
  cantidad: number | null;
  /** Texto escrito en el formulario (vacío = sin costo informado). */
  costo_unitario: string;
}

/** Error de validación asociado a una fila concreta. */
export interface ErrorLineaOrdenCompra {
  indice: number;
  campo: CampoLineaOrdenCompra;
  mensaje: string;
}

/** Resultado de validar el conjunto de líneas. */
export interface LineasOrdenCompraValidadas {
  ok: boolean;
  lineas: OrdenCompraLineaCrear[];
  errores: ErrorLineaOrdenCompra[];
  mensajeGeneral: string | null;
}

/** Datos ya validados por la pantalla antes de construir el cuerpo. */
export interface DatosOrdenCompra {
  proveedorId: number;
  sucursalId: number;
  fechaEstimada: string | null;
  observacion: string;
  lineas: readonly OrdenCompraLineaCrear[];
}

/**
 * Convierte el texto del formulario en un costo con 2 decimales.
 *
 * @returns `null` cuando el texto no es un decimal ≥ 0 con 2 decimales.
 */
export function normalizarCostoUnitario(texto: string): number | null {
  const limpio = (texto ?? '').trim().replace(',', '.');
  if (!PATRON_COSTO.test(limpio)) {
    return null;
  }
  const numero = Number(limpio);
  if (!Number.isFinite(numero) || numero < 0) {
    return null;
  }
  return Math.round(numero * 100) / 100;
}

/**
 * Convierte el valor de un `datetime-local` a ISO con offset.
 *
 * `datetime-local` entrega hora local sin zona (`2026-11-01T10:30`); se
 * interpreta en la zona del navegador y se serializa en UTC (`...Z`). Un texto
 * vacío devuelve `null`; uno inválido también, y la pantalla lo detecta con su
 * validador.
 */
export function fechaLocalAIso(texto: string): string | null {
  const limpio = (texto ?? '').trim();
  if (limpio.length === 0) {
    return null;
  }
  const fecha = new Date(limpio);
  if (Number.isNaN(fecha.getTime())) {
    return null;
  }
  return fecha.toISOString();
}

/** `true` si el valor es un entero >= 1. */
function esEnteroPositivo(valor: number | null): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 1;
}

/**
 * Valida y normaliza las líneas del alta de orden.
 *
 * No descarta filas incompletas en silencio: cada problema se devuelve con su
 * índice y el campo exacto que la UI debe marcar.
 */
export function validarLineasOrdenCompra(
  entradas: readonly LineaOrdenCompraEntrada[],
  maximoLineas: number = MAX_LINEAS_ORDEN_COMPRA,
): LineasOrdenCompraValidadas {
  if (entradas.length === 0) {
    return {
      ok: false,
      lineas: [],
      errores: [],
      mensajeGeneral: 'Agrega al menos una línea a la orden de compra.',
    };
  }

  if (entradas.length > maximoLineas) {
    return {
      ok: false,
      lineas: [],
      errores: [],
      mensajeGeneral: `Una orden de compra admite como máximo ${maximoLineas} líneas.`,
    };
  }

  const lineas: OrdenCompraLineaCrear[] = [];
  const errores: ErrorLineaOrdenCompra[] = [];

  entradas.forEach((entrada, indice) => {
    const erroresFila: ErrorLineaOrdenCompra[] = [];

    if (!esEnteroPositivo(entrada.variante_producto_id)) {
      erroresFila.push({
        indice,
        campo: 'variante_producto_id',
        mensaje: 'Selecciona la variante de la línea.',
      });
    }
    if (!esEnteroPositivo(entrada.temporada_id)) {
      erroresFila.push({
        indice,
        campo: 'temporada_id',
        mensaje: 'Selecciona la temporada de la línea.',
      });
    }
    if (
      entrada.cantidad === null ||
      !Number.isInteger(entrada.cantidad) ||
      entrada.cantidad < 1 ||
      entrada.cantidad > MAX_CANTIDAD_ORDEN_COMPRA
    ) {
      erroresFila.push({
        indice,
        campo: 'cantidad',
        mensaje: `La cantidad debe ser un entero entre 1 y ${MAX_CANTIDAD_ORDEN_COMPRA}.`,
      });
    }

    const costo = normalizarCostoUnitario(entrada.costo_unitario);
    if (costo === null) {
      erroresFila.push({
        indice,
        campo: 'costo_unitario',
        mensaje: 'El costo debe ser un número mayor o igual a 0 con hasta 2 decimales.',
      });
    }

    errores.push(...erroresFila);

    if (erroresFila.length === 0) {
      lineas.push({
        variante_producto_id: entrada.variante_producto_id as number,
        temporada_id: entrada.temporada_id as number,
        cantidad: entrada.cantidad as number,
        costo_unitario: costo as number,
      });
    }
  });

  return {
    ok: errores.length === 0 && lineas.length === entradas.length,
    lineas,
    errores,
    mensajeGeneral: null,
  };
}

/**
 * Construye el cuerpo EXACTO de `POST /tenant/ordenes-compra`.
 *
 * Omite `fecha_estimada` cuando no se informó y `observacion` cuando queda
 * vacía: `extra=forbid` rechaza campos ajenos, pero los opcionales pueden
 * omitirse en lugar de viajar en `null`.
 */
export function construirOrdenCompra(
  datos: DatosOrdenCompra,
): OrdenCompraCrear {
  const dto: OrdenCompraCrear = {
    proveedor_id: datos.proveedorId,
    sucursal_id: datos.sucursalId,
    lineas: datos.lineas.map((linea) => ({ ...linea })),
  };
  if (datos.fechaEstimada !== null) {
    dto.fecha_estimada = datos.fechaEstimada;
  }
  const observacion = datos.observacion.trim();
  if (observacion.length > 0) {
    dto.observacion = observacion;
  }
  return dto;
}
