import { HttpErrorResponse } from '@angular/common/http';

/** Resultado de traducir un error HTTP de compra digital (CU19). */
export interface ErrorVentaDigital {
  mensaje: string;
  /** true cuando el backend devuelve 401 (sesión expirada/inválida). */
  sesionExpirada: boolean;
  /** true cuando conviene que el cliente vuelva a revisar su carrito. */
  volverAlCarrito: boolean;
  /** true cuando la compra ya fue preparada (reintentar no tiene sentido). */
  yaPreparada: boolean;
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
  extra: Partial<Omit<ErrorVentaDigital, 'mensaje'>> = {},
): ErrorVentaDigital {
  return {
    mensaje,
    sesionExpirada: false,
    volverAlCarrito: false,
    yaPreparada: false,
    ...extra,
  };
}

/**
 * Traduce los errores de POST /ventas/digital a mensajes comprensibles.
 *
 * Nunca se exponen errores HTTP crudos, mensajes SQL ni stack traces.
 * 409 = carrito no activo / vacío / ya convertido / stock insuficiente /
 * inventario no disponible; en ese caso se sugiere volver al carrito.
 */
export function traducirErrorVentaDigital(error: unknown): ErrorVentaDigital {
  if (!(error instanceof HttpErrorResponse)) {
    return base('No fue posible preparar la compra. Intenta nuevamente.');
  }

  switch (error.status) {
    case 401:
      return base('Tu sesión expiró. Inicia sesión nuevamente.', {
        sesionExpirada: true,
      });
    case 403:
      return base('No puedes comprar este carrito.');
    case 404:
      return base('No encontramos el carrito que quieres comprar.', {
        volverAlCarrito: true,
      });
    case 422:
      return base('Revisa los datos de la compra: no son válidos.');
    case 0:
      return base(
        'No se pudo conectar con el servidor. Verifica tu conexión e intenta nuevamente.',
      );
  }

  if (error.status === 409) {
    const texto = detalle(error);

    if (texto.includes('convert') || texto.includes('ya fue')) {
      return base('Esta compra ya fue preparada.', { yaPreparada: true });
    }
    if (texto.includes('stock')) {
      return base('El stock cambió. Revisa tu carrito.', {
        volverAlCarrito: true,
      });
    }
    if (texto.includes('activo')) {
      return base('El carrito ya no está activo.', { volverAlCarrito: true });
    }
    if (texto.includes('contiene') || texto.includes('vacio')) {
      return base('El carrito ya no tiene prendas para comprar.', {
        volverAlCarrito: true,
      });
    }
    if (texto.includes('disponible')) {
      return base('Uno de los productos ya no está disponible.', {
        volverAlCarrito: true,
      });
    }
    if (texto.includes('sucursal')) {
      return base('El carrito cambió de sucursal. Vuelve a revisarlo.', {
        volverAlCarrito: true,
      });
    }
    return base('No fue posible preparar la compra. Revisa tu carrito.', {
      volverAlCarrito: true,
    });
  }

  if (error.status >= 500) {
    return base('El servicio no está disponible en este momento. Intenta nuevamente.');
  }

  return base('No fue posible preparar la compra. Intenta nuevamente.');
}
