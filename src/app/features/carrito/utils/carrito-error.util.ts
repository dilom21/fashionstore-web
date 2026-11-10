import { HttpErrorResponse } from '@angular/common/http';

/** Resultado de traducir un error HTTP del carrito (CU15). */
export interface ErrorCarrito {
  mensaje: string;
  /** true cuando el backend devuelve 401 (sesión expirada/inválida). */
  sesionExpirada: boolean;
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
  // 422 de FastAPI: detail es un arreglo de validaciones [{ msg, ... }].
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
 * Traduce los errores del backend del carrito a mensajes comprensibles.
 *
 * Nunca se exponen errores HTTP crudos ni stack traces. Cuando FastAPI envía un
 * `detail` humano (p. ej. "Stock insuficiente", "Inventario no disponible",
 * "Seleccion de inventario ambigua"), se conserva para que el usuario y el
 * diagnóstico reciban el motivo real; el `detalleOriginal` queda disponible.
 */
export function traducirErrorCarrito(error: unknown): ErrorCarrito {
  const codigo = error instanceof HttpErrorResponse ? error.status : null;
  const detalle = detalleBackend(error) ?? undefined;

  switch (codigo) {
    case 401:
      return {
        mensaje: 'Tu sesión expiró. Inicia sesión nuevamente.',
        sesionExpirada: true,
        detalleOriginal: detalle,
      };
    case 403:
      return {
        mensaje: 'No tienes permisos para operar con el carrito.',
        sesionExpirada: false,
        detalleOriginal: detalle,
      };
    case 404:
      return {
        mensaje: detalle ?? 'El producto o la disponibilidad ya no existe.',
        sesionExpirada: false,
        detalleOriginal: detalle,
      };
    case 409:
      return {
        mensaje: detalle ?? 'Ya no hay suficiente stock disponible.',
        sesionExpirada: false,
        detalleOriginal: detalle,
      };
    case 422:
      return {
        mensaje:
          detalle ?? 'Revisa la cantidad ingresada: los datos no son válidos.',
        sesionExpirada: false,
        detalleOriginal: detalle,
      };
    case 503:
      return {
        mensaje:
          'El servicio del carrito no está disponible en este momento. Intenta nuevamente más tarde.',
        sesionExpirada: false,
        detalleOriginal: detalle,
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
      detalleOriginal: detalle,
    };
  }

  return {
    mensaje: 'No se pudo completar la operación con el carrito. Intenta nuevamente.',
    sesionExpirada: false,
    detalleOriginal: detalle,
  };
}
