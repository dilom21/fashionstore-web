import { HttpErrorResponse } from '@angular/common/http';

/** Resultado de traducir un error HTTP de venta presencial (CU20). */
export interface ErrorVentaPresencial {
  mensaje: string;
  /** true cuando el backend devuelve 401 (sesión expirada/inválida). */
  sesionExpirada: boolean;
  /** true cuando el rol no puede registrar la venta (403). */
  sinPermiso: boolean;
  /** true cuando la reserva ya no puede venderse (404/409 de reserva). */
  reservaNoDisponible: boolean;
  /** true cuando la reserva ya originó una venta (doble submit/reintento). */
  ventaDuplicada: boolean;
  /** true cuando el stock o la disponibilidad cambiaron (409). */
  stockCambio: boolean;
  /** true cuando las líneas mezclan sucursales (409). */
  sucursalMultiple: boolean;
  /** true cuando conviene volver a la búsqueda del POS. */
  volverAlCatalogo: boolean;
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
  extra: Partial<Omit<ErrorVentaPresencial, 'mensaje'>> = {},
): ErrorVentaPresencial {
  return {
    mensaje,
    sesionExpirada: false,
    sinPermiso: false,
    reservaNoDisponible: false,
    ventaDuplicada: false,
    stockCambio: false,
    sucursalMultiple: false,
    volverAlCatalogo: false,
    ...extra,
  };
}

/**
 * Traduce los errores de POST /ventas/presencial a mensajes comprensibles.
 *
 * Nunca se exponen errores HTTP crudos, mensajes SQL ni stack traces.
 * El backend devuelve mensajes de negocio genéricos para 409, por lo que la
 * clasificación fina se apoya en `detail` cuando está disponible.
 */
export function traducirErrorVentaPresencial(
  error: unknown,
): ErrorVentaPresencial {
  if (!(error instanceof HttpErrorResponse)) {
    return base('No fue posible registrar la venta. Intenta nuevamente.');
  }

  switch (error.status) {
    case 401:
      return base('Tu sesión expiró. Inicia sesión nuevamente.', {
        sesionExpirada: true,
      });
    case 403:
      return base('No tienes permiso para registrar esta venta.', {
        sinPermiso: true,
      });
    case 404: {
      const texto = detalle(error);
      if (texto.includes('reserva')) {
        return base('La reserva ya no puede venderse.', {
          reservaNoDisponible: true,
        });
      }
      return base('El inventario ya no está disponible.', {
        volverAlCatalogo: true,
      });
    }
    case 422:
      return base('Revisa los datos de la venta: no son válidos.');
    case 0:
      return base(
        'No se pudo conectar con el servidor. Verifica tu conexión e intenta nuevamente.',
      );
  }

  if (error.status === 409) {
    const texto = detalle(error);

    if (texto.includes('reserva') && texto.includes('venta')) {
      return base('Esta reserva ya tiene una venta registrada.', {
        ventaDuplicada: true,
        reservaNoDisponible: true,
      });
    }
    if (texto.includes('sucursal')) {
      return base('Los productos deben pertenecer a una sola sucursal.', {
        sucursalMultiple: true,
        volverAlCatalogo: true,
      });
    }
    if (texto.includes('stock')) {
      return base('El stock cambió. Revisa las cantidades.', {
        stockCambio: true,
        volverAlCatalogo: true,
      });
    }
    return base('No fue posible registrar la venta. Revisa las cantidades.', {
      volverAlCatalogo: true,
    });
  }

  if (error.status >= 500) {
    return base(
      'El servicio no está disponible en este momento. Intenta nuevamente.',
    );
  }

  return base('No fue posible registrar la venta. Intenta nuevamente.');
}
