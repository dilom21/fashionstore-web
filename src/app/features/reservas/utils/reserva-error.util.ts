import { HttpErrorResponse } from '@angular/common/http';

/** Resultado de traducir un error HTTP de reservas (CU16). */
export interface ErrorReserva {
  mensaje: string;
  /** true cuando el backend devuelve 401 (sesión expirada/inválida). */
  sesionExpirada: boolean;
  /** true cuando el error indica que el carrito debe revisarse en CU15. */
  volverAlCarrito: boolean;
}

/**
 * Traduce los errores del backend de reservas a mensajes comprensibles.
 *
 * Nunca se exponen errores HTTP crudos, mensajes SQL ni stack traces.
 * 409 = el carrito expiró, fue eliminado, ya fue convertido/reservado o no hay
 * stock suficiente; en ese caso se sugiere volver al carrito.
 */
export function traducirErrorReserva(error: unknown): ErrorReserva {
  const codigo = error instanceof HttpErrorResponse ? error.status : null;

  switch (codigo) {
    case 401:
      return {
        mensaje: 'Tu sesión expiró. Inicia sesión nuevamente.',
        sesionExpirada: true,
        volverAlCarrito: false,
      };
    case 403:
      return {
        mensaje: 'No tienes permisos para operar con esta reserva.',
        sesionExpirada: false,
        volverAlCarrito: false,
      };
    case 404:
      return {
        mensaje: 'No encontramos el carrito o la reserva solicitada.',
        sesionExpirada: false,
        volverAlCarrito: true,
      };
    case 409:
      return {
        mensaje:
          'No se pudo completar la reserva: tu carrito expiró, ya fue reservado o no hay stock suficiente. Vuelve a tu carrito e inténtalo nuevamente.',
        sesionExpirada: false,
        volverAlCarrito: true,
      };
    case 422:
      return {
        mensaje:
          'Revisa la fecha y la hora de atención: los datos no son válidos.',
        sesionExpirada: false,
        volverAlCarrito: false,
      };
    case 0:
      return {
        mensaje:
          'No se pudo conectar con el servidor. Verifica tu conexión e intenta nuevamente.',
        sesionExpirada: false,
        volverAlCarrito: false,
      };
  }

  if (codigo !== null && codigo >= 500) {
    return {
      mensaje:
        'El servicio no está disponible en este momento. Intenta nuevamente.',
      sesionExpirada: false,
      volverAlCarrito: false,
    };
  }

  return {
    mensaje: 'No se pudo completar la operación con la reserva. Intenta nuevamente.',
    sesionExpirada: false,
    volverAlCarrito: false,
  };
}
