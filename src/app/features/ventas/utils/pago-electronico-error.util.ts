import { HttpErrorResponse } from '@angular/common/http';

/** Resultado de traducir un error HTTP de pago electrónico (CU22). */
export interface ErrorPagoElectronico {
  mensaje: string;
  /** true cuando el backend devuelve 401 (sesión expirada/inválida). */
  sesionExpirada: boolean;
  /** true cuando la venta pertenece a otro cliente (403). */
  ventaAjena: boolean;
  /** true cuando la venta o su pago no existen (404). */
  ventaNoEncontrada: boolean;
  /** true cuando la venta no es pagable / ya está pagada (409). */
  ventaNoPagable: boolean;
  /** true cuando la petición no es válida (422). */
  requestInvalido: boolean;
  /** true cuando falla la pasarela o el backend (5xx / 502). */
  servicioNoDisponible: boolean;
}

function base(
  mensaje: string,
  extra: Partial<Omit<ErrorPagoElectronico, 'mensaje'>> = {},
): ErrorPagoElectronico {
  return {
    mensaje,
    sesionExpirada: false,
    ventaAjena: false,
    ventaNoEncontrada: false,
    ventaNoPagable: false,
    requestInvalido: false,
    servicioNoDisponible: false,
    ...extra,
  };
}

/**
 * Traduce los errores de los endpoints CU22 a mensajes comprensibles.
 *
 * Nunca se exponen errores HTTP crudos, mensajes SQL ni stack traces. El
 * backend ya devuelve mensajes de negocio genéricos; aquí solo se clasifica por
 * código para decidir la UX.
 */
export function traducirErrorPagoElectronico(
  error: unknown,
): ErrorPagoElectronico {
  if (!(error instanceof HttpErrorResponse)) {
    return base('No fue posible procesar el pago. Intenta nuevamente.');
  }

  switch (error.status) {
    case 401:
      return base('Tu sesión expiró. Inicia sesión nuevamente.', {
        sesionExpirada: true,
      });
    case 403:
      return base('No puedes pagar esta venta: pertenece a otro cliente.', {
        ventaAjena: true,
      });
    case 404:
      return base('No encontramos la venta o su pago electrónico.', {
        ventaNoEncontrada: true,
      });
    case 422:
      return base('Los datos del pago no son válidos.', {
        requestInvalido: true,
      });
    case 0:
      return base(
        'No se pudo conectar con el servidor. Verifica tu conexión e intenta nuevamente.',
      );
  }

  if (error.status === 409) {
    return base(
      'La venta no está disponible para pago: puede estar completada o en un estado inconsistente.',
      { ventaNoPagable: true },
    );
  }

  if (error.status >= 500) {
    return base(
      'La pasarela de pago o el servicio no están disponibles en este momento. Intenta nuevamente.',
      { servicioNoDisponible: true },
    );
  }

  return base('No fue posible procesar el pago. Intenta nuevamente.');
}
