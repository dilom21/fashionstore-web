import { HttpErrorResponse } from '@angular/common/http';

/** Error traducido del historial o del detalle de compra (CU24). */
export interface ErrorHistorialCompras {
  mensaje: string;
  /** true cuando el backend devuelve 401 (sesión expirada/inválida). */
  sesionExpirada: boolean;
  /** true cuando el rol/alcance no permite consultar (403). */
  sinPermiso: boolean;
  /** true cuando la compra no existe (404). */
  noEncontrada: boolean;
  /** true cuando la venta aún no es histórica: PENDIENTE/PAGADA (409). */
  noHistorica: boolean;
  /** true cuando los filtros son inválidos: rango de fechas (422). */
  filtrosInvalidos: boolean;
  /** true cuando fue un fallo de red o del servidor (0 / 5xx). */
  esRed: boolean;
  /** true cuando tiene sentido ofrecer REINTENTAR. */
  puedeReintentar: boolean;
}

function base(
  mensaje: string,
  extra: Partial<Omit<ErrorHistorialCompras, 'mensaje'>> = {},
): ErrorHistorialCompras {
  return {
    mensaje,
    sesionExpirada: false,
    sinPermiso: false,
    noEncontrada: false,
    noHistorica: false,
    filtrosInvalidos: false,
    esRed: false,
    puedeReintentar: false,
    ...extra,
  };
}

const MENSAJE_HISTORIAL = 'No pudimos cargar tu historial. Intenta nuevamente.';
const MENSAJE_DETALLE = 'No pudimos cargar el detalle. Intenta nuevamente.';

function traducir(
  error: unknown,
  porDefecto: string,
  mensajeNoEncontrada: string,
  mensajeSinPermiso: string,
  mensajeNoHistorica: string,
): ErrorHistorialCompras {
  if (!(error instanceof HttpErrorResponse)) {
    return base(porDefecto, { esRed: true, puedeReintentar: true });
  }

  switch (error.status) {
    case 401:
      return base('Tu sesión expiró. Inicia sesión nuevamente.', {
        sesionExpirada: true,
      });
    case 403:
      return base(mensajeSinPermiso, { sinPermiso: true });
    case 404:
      return base(mensajeNoEncontrada, { noEncontrada: true });
    case 409:
      return base(mensajeNoHistorica, { noHistorica: true });
    case 422:
      return base('Revisa los filtros de búsqueda e intenta nuevamente.', {
        filtrosInvalidos: true,
      });
    case 0:
      return base(porDefecto, { esRed: true, puedeReintentar: true });
  }

  if (error.status >= 500) {
    return base(porDefecto, { esRed: true, puedeReintentar: true });
  }

  return base(porDefecto, { esRed: true, puedeReintentar: true });
}

/**
 * Traduce los errores de `GET /ventas/historial`.
 *
 * Nunca se exponen HTTP crudos, `detail` técnico, SQL ni stack traces.
 */
export function traducirErrorHistorial(
  error: unknown,
): ErrorHistorialCompras {
  return traducir(
    error,
    MENSAJE_HISTORIAL,
    'No encontramos tu historial de compras.',
    'No tienes autorización para consultar este historial.',
    'Esta venta aún no forma parte de tu historial.',
  );
}

/** Traduce los errores de `GET /ventas/historial/{venta_id}`. */
export function traducirErrorDetalleCompra(
  error: unknown,
): ErrorHistorialCompras {
  return traducir(
    error,
    MENSAJE_DETALLE,
    'No encontramos esta compra.',
    'No tienes autorización para consultar esta compra.',
    'Esta venta aún no forma parte de tu historial.',
  );
}
