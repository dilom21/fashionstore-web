import { HttpErrorResponse } from '@angular/common/http';

/** Resultado de traducir un error HTTP de pago presencial (CU21). */
export interface ErrorPagoPresencial {
  mensaje: string;
  /** true cuando el backend devuelve 401 (sesión expirada/inválida). */
  sesionExpirada: boolean;
  /** true cuando el rol no puede registrar el pago (403). */
  sinPermiso: boolean;
  /** true cuando la venta ya no existe (404). */
  ventaNoDisponible: boolean;
  /** true cuando la venta ya fue pagada/confirmada (409). */
  yaPagada: boolean;
  /** true cuando el stock cambió y la venta no pudo confirmarse (409). */
  stockCambio: boolean;
  /** true cuando el método enviado no es válido (422/409). */
  metodoInvalido: boolean;
  /** true cuando `sp_confirmar_venta` no pudo confirmar la venta (409). */
  noConfirmada: boolean;
}

/**
 * Extrae `error.error.detail` como texto plano SOLO para clasificar el 409.
 * Nunca se muestra al usuario: los mensajes son de negocio.
 */
function detalle(error: HttpErrorResponse): string {
  const cuerpo: unknown = error.error;
  if (cuerpo !== null && typeof cuerpo === 'object') {
    const valor = (cuerpo as { detail?: unknown }).detail;
    if (typeof valor === 'string') {
      return valor.toLowerCase();
    }
  }
  return '';
}

function base(
  mensaje: string,
  extra: Partial<Omit<ErrorPagoPresencial, 'mensaje'>> = {},
): ErrorPagoPresencial {
  return {
    mensaje,
    sesionExpirada: false,
    sinPermiso: false,
    ventaNoDisponible: false,
    yaPagada: false,
    stockCambio: false,
    metodoInvalido: false,
    noConfirmada: false,
    ...extra,
  };
}

/**
 * Traduce los errores de POST /pagos/presencial a mensajes comprensibles.
 *
 * Nunca se exponen errores HTTP crudos, mensajes SQL ni stack traces. El
 * backend devuelve mensajes de negocio genéricos para 409, por lo que la
 * clasificación fina se apoya en `detail` cuando está disponible.
 */
export function traducirErrorPagoPresencial(
  error: unknown,
): ErrorPagoPresencial {
  if (!(error instanceof HttpErrorResponse)) {
    return base('No fue posible registrar el pago. Intenta nuevamente.');
  }

  switch (error.status) {
    case 401:
      return base('Tu sesión expiró. Inicia sesión nuevamente.', {
        sesionExpirada: true,
      });
    case 403:
      return base('No tienes permiso para registrar este pago.', {
        sinPermiso: true,
      });
    case 404:
      return base('La venta ya no está disponible.', {
        ventaNoDisponible: true,
      });
    case 422:
      return base('El método de pago no es válido.', {
        metodoInvalido: true,
      });
    case 0:
      return base(
        'No se pudo conectar con el servidor. Verifica tu conexión e intenta nuevamente.',
      );
  }

  if (error.status === 409) {
    const texto = detalle(error);

    if (texto.includes('stock')) {
      return base('El stock cambió antes del pago. Revisa la venta.', {
        stockCambio: true,
      });
    }
    if (texto.includes('metodo') || texto.includes('método')) {
      return base('El método de pago no es válido.', {
        metodoInvalido: true,
      });
    }
    if (
      texto.includes('ya tiene un pago') ||
      texto.includes('pago aprobado') ||
      texto.includes('pagada')
    ) {
      return base('Esta venta ya fue pagada o confirmada.', {
        yaPagada: true,
      });
    }
    if (texto.includes('no esta pendiente') || texto.includes('estado')) {
      return base('Esta venta ya fue pagada o confirmada.', {
        yaPagada: true,
      });
    }
    if (texto.includes('presencial')) {
      return base(
        'La venta no es presencial: no corresponde a este endpoint.',
      );
    }
    return base('No fue posible confirmar la venta.', {
      noConfirmada: true,
    });
  }

  if (error.status >= 500) {
    return base(
      'El servicio no está disponible en este momento. Intenta nuevamente.',
    );
  }

  return base('No fue posible registrar el pago. Intenta nuevamente.');
}
