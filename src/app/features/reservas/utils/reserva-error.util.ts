import { HttpErrorResponse } from '@angular/common/http';

/** Resultado de traducir un error HTTP de reservas (CU11/CU16). */
export interface ErrorReserva {
  mensaje: string;
  /** true cuando el backend devuelve 401 (sesión expirada/inválida). */
  sesionExpirada: boolean;
  /** true cuando el error indica que el carrito debe revisarse en CU15. */
  volverAlCarrito: boolean;
  /** Detalle original devuelto por FastAPI (diagnóstico), si existe. */
  detalleOriginal?: string;
}

/** Extrae el detalle textual que FastAPI envía en {"detail": ...}. */
function detalleBackend(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  const cuerpo = error.error as { detail?: unknown } | null;
  if (cuerpo === null || typeof cuerpo !== 'object') {
    return null;
  }
  if (typeof cuerpo.detail === 'string' && cuerpo.detail.trim().length > 0) {
    return cuerpo.detail.trim();
  }
  if (Array.isArray(cuerpo.detail)) {
    const mensajes = cuerpo.detail
      .map((item) => {
        if (item !== null && typeof item === 'object') {
          const msg = (item as { msg?: unknown }).msg;
          return typeof msg === 'string' ? msg.trim() : '';
        }
        return '';
      })
      .filter((msg) => msg.length > 0);
    if (mensajes.length > 0) {
      return mensajes.join(' ');
    }
  }
  return null;
}

/**
 * Traduce los errores del backend de reservas a mensajes comprensibles.
 *
 * Nunca se exponen errores HTTP crudos, mensajes SQL ni stack traces. Cuando
 * FastAPI envía un `detail` humano se conserva (diagnóstico) y se usa como
 * mensaje; el `detalleOriginal` queda disponible.
 */
export function traducirErrorReserva(error: unknown): ErrorReserva {
  const codigo = error instanceof HttpErrorResponse ? error.status : null;
  const detalle = detalleBackend(error) ?? undefined;

  switch (codigo) {
    case 401:
      return {
        mensaje: 'Tu sesión expiró. Inicia sesión nuevamente.',
        sesionExpirada: true,
        volverAlCarrito: false,
        detalleOriginal: detalle,
      };
    case 403:
      return {
        mensaje: detalle ?? 'No tienes permisos para operar con esta reserva.',
        sesionExpirada: false,
        volverAlCarrito: false,
        detalleOriginal: detalle,
      };
    case 404:
      return {
        mensaje: detalle ?? 'No encontramos el carrito o la reserva solicitada.',
        sesionExpirada: false,
        volverAlCarrito: true,
        detalleOriginal: detalle,
      };
    case 409:
      return {
        mensaje:
          detalle ??
          'No se pudo completar la reserva: tu carrito expiró, ya fue reservado o no hay stock suficiente. Vuelve a tu carrito e inténtalo nuevamente.',
        sesionExpirada: false,
        volverAlCarrito: true,
        detalleOriginal: detalle,
      };
    case 422:
      return {
        mensaje:
          detalle ??
          'Revisa la fecha y la hora de atención: los datos no son válidos.',
        sesionExpirada: false,
        volverAlCarrito: false,
        detalleOriginal: detalle,
      };
    case 503:
      return {
        mensaje:
          'El servicio de reservas no está disponible en este momento (puede estar deshabilitado en el servidor). Intenta más tarde.',
        sesionExpirada: false,
        volverAlCarrito: false,
        detalleOriginal: detalle,
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
      detalleOriginal: detalle,
    };
  }

  return {
    mensaje:
      'No se pudo completar la operación con la reserva. Intenta nuevamente.',
    sesionExpirada: false,
    volverAlCarrito: false,
    detalleOriginal: detalle,
  };
}
