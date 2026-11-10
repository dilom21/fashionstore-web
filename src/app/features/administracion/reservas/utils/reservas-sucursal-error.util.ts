import { HttpErrorResponse } from '@angular/common/http';

/** Resultado de traducir un error HTTP de CU17. */
export interface ErrorReservasSucursal {
  mensaje: string;
  /** true cuando el backend devuelve 401 (sesión expirada/inválida). */
  sesionExpirada: boolean;
}

/**
 * Traduce los errores del backend CU17 a mensajes comprensibles.
 *
 * Nunca se exponen mensajes SQL, trazas ni detalles internos.
 * 403 = rol no autorizado o reserva/sucursal fuera del alcance del encargado;
 * 409 = transición de estado inválida; 422 = filtros inválidos (p. ej. rango de
 * fechas invertido).
 */
export function traducirErrorReservasSucursal(
  error: unknown,
): ErrorReservasSucursal {
  const codigo = error instanceof HttpErrorResponse ? error.status : null;

  switch (codigo) {
    case 401:
      return {
        mensaje: 'Tu sesión expiró. Inicia sesión nuevamente.',
        sesionExpirada: true,
      };
    case 403:
      return {
        mensaje:
          'No tienes permisos para gestionar estas reservas (o están fuera de tu sucursal).',
        sesionExpirada: false,
      };
    case 404:
      return {
        mensaje: 'La reserva solicitada ya no existe.',
        sesionExpirada: false,
      };
    case 409:
      return {
        mensaje:
          'La reserva no permite esa acción en su estado actual. Actualiza la información e inténtalo nuevamente.',
        sesionExpirada: false,
      };
    case 422:
      return {
        mensaje:
          'Revisa los filtros: el rango de fechas o los datos enviados no son válidos.',
        sesionExpirada: false,
      };
    case 0:
      return {
        mensaje:
          'No se pudo conectar con el servidor. Verifica tu conexión e intenta nuevamente.',
        sesionExpirada: false,
      };
  }

  if (codigo !== null && codigo >= 500) {
    return {
      mensaje:
        'El servicio no está disponible en este momento. Intenta nuevamente.',
      sesionExpirada: false,
    };
  }

  return {
    mensaje: 'No se pudo completar la operación con la reserva. Intenta nuevamente.',
    sesionExpirada: false,
  };
}
