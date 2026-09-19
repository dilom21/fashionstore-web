import { HttpErrorResponse } from '@angular/common/http';

/** Resultado de traducir un error HTTP del carrito (CU15). */
export interface ErrorCarrito {
  mensaje: string;
  /** true cuando el backend devuelve 401 (sesión expirada/inválida). */
  sesionExpirada: boolean;
}

/**
 * Traduce los errores del backend del carrito a mensajes comprensibles.
 *
 * Nunca se exponen errores HTTP crudos ni stack traces.
 * 409 = stock insuficiente; 404 = producto/disponibilidad inexistente;
 * 403 = sin permiso (p. ej. personal intentando usar el carrito de un cliente).
 */
export function traducirErrorCarrito(error: unknown): ErrorCarrito {
  const codigo = error instanceof HttpErrorResponse ? error.status : null;

  switch (codigo) {
    case 401:
      return {
        mensaje: 'Tu sesión expiró. Inicia sesión nuevamente.',
        sesionExpirada: true,
      };
    case 403:
      return {
        mensaje: 'No tienes permisos para operar con el carrito.',
        sesionExpirada: false,
      };
    case 404:
      return {
        mensaje: 'El producto o la disponibilidad ya no existe.',
        sesionExpirada: false,
      };
    case 409:
      return {
        mensaje: 'Ya no hay suficiente stock disponible.',
        sesionExpirada: false,
      };
    case 422:
      return {
        mensaje: 'Revisa la cantidad ingresada: los datos no son válidos.',
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
      mensaje: 'El servicio no está disponible en este momento. Intenta nuevamente.',
      sesionExpirada: false,
    };
  }

  return {
    mensaje: 'No se pudo completar la operación con el carrito. Intenta nuevamente.',
    sesionExpirada: false,
  };
}
