import {
  MetodoPagoTenant,
  VentaContadoLineaSolicitud,
  VentaContadoSolicitud,
} from '../../models/tenant.models';

/**
 * Utilidades puras de la venta de contado.
 *
 * Se extraen del componente para poder probar sin Angular las reglas del
 * contrato: al menos una línea, máximo 50, `inventario_id` entero > 0 y
 * `cantidad` entera entre 1 y 1000. El frontend NO calcula precios ni totales.
 */

/** Máximo de líneas por venta que acepta el backend. */
export const MAX_LINEAS_VENTA = 50;

/** Máximo de unidades por línea que acepta el backend. */
export const MAX_CANTIDAD_LINEA = 1000;

/** Fila del formulario, tal como la maneja la UI (puede estar incompleta). */
export interface LineaVentaEntrada {
  inventario_id: number | null;
  cantidad: number | null;
}

/** Línea lista para viajar en el cuerpo de la venta. */
export interface LineaVentaNormalizada {
  inventario_id: number;
  cantidad: number;
}

/** Campo de la línea que produjo el error. */
export type CampoLineaVenta = 'inventario_id' | 'cantidad';

/** Error de validación asociado a una fila concreta. */
export interface ErrorLineaVenta {
  /** Índice de la fila (base 0). */
  indice: number;
  campo: CampoLineaVenta;
  mensaje: string;
}

/** Resultado de validar el conjunto de líneas. */
export interface LineasVentaValidadas {
  /** `true` solo si no hay errores y hay al menos una línea válida. */
  ok: boolean;
  /** Solo las líneas válidas, ya normalizadas. */
  lineas: LineaVentaNormalizada[];
  errores: ErrorLineaVenta[];
  /** Error de la tabla completa (sin líneas o demasiadas líneas). */
  mensajeGeneral: string | null;
}

/** `true` si el valor es un entero dentro del rango indicado. */
function esEnteroEnRango(
  valor: number | null,
  minimo: number,
  maximo: number,
): valor is number {
  return (
    typeof valor === 'number' &&
    Number.isInteger(valor) &&
    valor >= minimo &&
    valor <= maximo
  );
}

/**
 * Valida y normaliza las líneas del formulario.
 *
 * No descarta silenciosamente filas incompletas: cada problema se devuelve con
 * su índice para que la UI pueda marcar el campo exacto.
 */
export function validarLineasVenta(
  entradas: readonly LineaVentaEntrada[],
  maximoLineas: number = MAX_LINEAS_VENTA,
): LineasVentaValidadas {
  if (entradas.length === 0) {
    return {
      ok: false,
      lineas: [],
      errores: [],
      mensajeGeneral: 'Agrega al menos una línea de venta.',
    };
  }

  if (entradas.length > maximoLineas) {
    return {
      ok: false,
      lineas: [],
      errores: [],
      mensajeGeneral: `Una venta admite como máximo ${maximoLineas} líneas.`,
    };
  }

  const lineas: LineaVentaNormalizada[] = [];
  const errores: ErrorLineaVenta[] = [];

  entradas.forEach((entrada, indice) => {
    if (!esEnteroEnRango(entrada.inventario_id, 1, Number.MAX_SAFE_INTEGER)) {
      errores.push({
        indice,
        campo: 'inventario_id',
        mensaje: 'Ingresa el identificador de inventario (entero mayor que 0).',
      });
    }
    if (!esEnteroEnRango(entrada.cantidad, 1, MAX_CANTIDAD_LINEA)) {
      errores.push({
        indice,
        campo: 'cantidad',
        mensaje: `La cantidad debe ser un entero entre 1 y ${MAX_CANTIDAD_LINEA}.`,
      });
    }
    if (
      esEnteroEnRango(entrada.inventario_id, 1, Number.MAX_SAFE_INTEGER) &&
      esEnteroEnRango(entrada.cantidad, 1, MAX_CANTIDAD_LINEA)
    ) {
      lineas.push({
        inventario_id: entrada.inventario_id,
        cantidad: entrada.cantidad,
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

/** Datos que la pantalla ya validó antes de construir el cuerpo. */
export interface DatosVentaContado {
  sucursalId: number;
  operacionId: string;
  metodoPago: MetodoPagoTenant;
  lineas: readonly LineaVentaNormalizada[];
}

/**
 * Construye el cuerpo EXACTO de `POST /tenant/ventas/contado`.
 *
 * No agrega empresa, usuario, precios ni totales: `extra="forbid"` rechazaría
 * cualquier campo ajeno al contrato.
 */
export function construirSolicitudContado(
  datos: DatosVentaContado,
): VentaContadoSolicitud {
  const lineas: VentaContadoLineaSolicitud[] = datos.lineas.map((linea) => ({
    inventario_id: linea.inventario_id,
    cantidad: linea.cantidad,
  }));

  return {
    sucursal_id: datos.sucursalId,
    operacion_id: datos.operacionId,
    metodo_pago: datos.metodoPago,
    lineas,
  };
}

/**
 * Genera el `operacion_id` de idempotencia (UUID v4).
 *
 * Usa `crypto.randomUUID()` cuando existe; si el navegador no lo expone, cae a
 * un UUID v4 construido con `crypto.getRandomValues()`. Nunca se reutiliza
 * entre ventas: solo se conserva para reintentos idénticos.
 */
export function generarOperacionId(): string {
  const cripto = globalThis.crypto;
  if (cripto !== undefined && typeof cripto.randomUUID === 'function') {
    return cripto.randomUUID();
  }
  return uuidV4DeRespaldo(cripto);
}

/** UUID v4 sin `randomUUID()`: 16 bytes aleatorios con la versión y variante. */
function uuidV4DeRespaldo(cripto: Crypto | undefined): string {
  const bytes = new Uint8Array(16);

  if (cripto !== undefined && typeof cripto.getRandomValues === 'function') {
    cripto.getRandomValues(bytes);
  } else {
    // Último recurso (entornos sin Web Crypto). No se usa para seguridad.
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}
