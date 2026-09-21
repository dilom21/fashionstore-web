import { HttpErrorResponse } from '@angular/common/http';

/** Resultado de traducir un error HTTP del comprobante de venta (CU23). */
export interface ErrorComprobanteVenta {
  mensaje: string;
  /** true cuando el backend devuelve 401 (sesión expirada/inválida). */
  sesionExpirada: boolean;
  /** true cuando el rol/alcance no permite ver el comprobante (403). */
  sinPermiso: boolean;
  /** true cuando la venta no existe (404). */
  noEncontrada: boolean;
  /** true cuando la venta aún no está COMPLETADA o no tiene pago APROBADO (409). */
  noDisponible: boolean;
  /** true cuando fue un fallo de red o del servidor (0 / 5xx). */
  esRed: boolean;
  /** true cuando tiene sentido ofrecer REINTENTAR. */
  puedeReintentar: boolean;
}

function base(
  mensaje: string,
  extra: Partial<Omit<ErrorComprobanteVenta, 'mensaje'>> = {},
): ErrorComprobanteVenta {
  return {
    mensaje,
    sesionExpirada: false,
    sinPermiso: false,
    noEncontrada: false,
    noDisponible: false,
    esRed: false,
    puedeReintentar: false,
    ...extra,
  };
}

/**
 * Traduce los errores de GET /ventas/{venta_id}/comprobante a mensajes
 * comprensibles.
 *
 * Nunca se exponen errores HTTP crudos, `detail` técnico, mensajes SQL ni stack
 * traces. El backend responde 404 (venta inexistente), 403 (venta ajena, fuera
 * de sucursal o rol no permitido) y 409 (venta no COMPLETADA o sin pago
 * APROBADO).
 */
export function traducirErrorComprobante(
  error: unknown,
): ErrorComprobanteVenta {
  if (!(error instanceof HttpErrorResponse)) {
    return base('No pudimos cargar el comprobante. Intenta nuevamente.', {
      esRed: true,
      puedeReintentar: true,
    });
  }

  switch (error.status) {
    case 401:
      return base('Tu sesión expiró. Inicia sesión nuevamente.', {
        sesionExpirada: true,
      });
    case 403:
      return base('No tienes autorización para consultar este comprobante.', {
        sinPermiso: true,
      });
    case 404:
      return base('Venta no encontrada.', {
        noEncontrada: true,
      });
    case 409:
      return base(
        'El comprobante aún no está disponible para esta venta.',
        { noDisponible: true },
      );
    case 0:
      return base('No pudimos cargar el comprobante. Intenta nuevamente.', {
        esRed: true,
        puedeReintentar: true,
      });
    case 422:
      return base('El identificador de la venta no es válido.', {
        noEncontrada: true,
      });
  }

  if (error.status >= 500) {
    return base('No pudimos cargar el comprobante. Intenta nuevamente.', {
      esRed: true,
      puedeReintentar: true,
    });
  }

  return base('No pudimos cargar el comprobante. Intenta nuevamente.', {
    esRed: true,
    puedeReintentar: true,
  });
}
