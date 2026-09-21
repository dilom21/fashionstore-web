import { HttpErrorResponse } from '@angular/common/http';

/** Error traducido de cualquier operación de CU25. */
export interface ErrorDevolucion {
  mensaje: string;
  /** 401: sesión expirada/inválida. */
  sesionExpirada: boolean;
  /** 403: rol/alcance insuficiente. */
  sinPermiso: boolean;
  /** 404: venta o devolución inexistente. */
  noEncontrada: boolean;
  /** 409: conflicto de negocio (estado/cantidad/venta no devolvible). */
  conflicto: boolean;
  /** 422: datos inválidos (motivo vacío, rango de fechas, etc.). */
  datosInvalidos: boolean;
  /** Fallo de red o del servidor (0 / 5xx). */
  esRed: boolean;
  /** Tiene sentido ofrecer REINTENTAR. */
  puedeReintentar: boolean;
  /** 409 por cantidades ya consumidas: hay que revalidar la venta. */
  disponibilidadCambiada: boolean;
}

function base(
  mensaje: string,
  extra: Partial<Omit<ErrorDevolucion, 'mensaje'>> = {},
): ErrorDevolucion {
  return {
    mensaje,
    sesionExpirada: false,
    sinPermiso: false,
    noEncontrada: false,
    conflicto: false,
    datosInvalidos: false,
    esRed: false,
    puedeReintentar: false,
    disponibilidadCambiada: false,
    ...extra,
  };
}

/** `error.error.detail` en minúsculas, solo para clasificar el 409. */
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

const MENSAJE_RED = 'No pudimos completar la operación. Intenta nuevamente.';

/**
 * Traduce los errores HTTP de CU25 a mensajes de negocio.
 *
 * Nunca se exponen `HttpErrorResponse` crudos, `detail` técnico, SQL,
 * constraints ni stack traces.
 */
function traducir(
  error: unknown,
  mensajes: {
    noEncontrada: string;
    conflicto: string;
    sinPermiso?: string;
    datosInvalidos?: string;
    red?: string;
  },
): ErrorDevolucion {
  if (!(error instanceof HttpErrorResponse)) {
    return base(mensajes.red ?? MENSAJE_RED, {
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
      return base(
        mensajes.sinPermiso ??
          'No tienes autorización para realizar esta operación.',
        { sinPermiso: true },
      );
    case 404:
      return base(mensajes.noEncontrada, { noEncontrada: true });
    case 409:
      return traducir409(error, mensajes.conflicto);
    case 422:
      return base(
        mensajes.datosInvalidos ?? 'Revisa los datos ingresados.',
        { datosInvalidos: true },
      );
    case 0:
      return base(mensajes.red ?? MENSAJE_RED, {
        esRed: true,
        puedeReintentar: true,
      });
  }

  if (error.status >= 500) {
    return base(mensajes.red ?? MENSAJE_RED, {
      esRed: true,
      puedeReintentar: true,
    });
  }

  return base(mensajes.red ?? MENSAJE_RED, {
    esRed: true,
    puedeReintentar: true,
  });
}

/** Clasifica el 409 real del backend (venta/cantidad/estado/procesamiento). */
function traducir409(
  error: HttpErrorResponse,
  porDefecto: string,
): ErrorDevolucion {
  const texto = detalle(error);

  if (texto.includes('disponible') || texto.includes('cantidad')) {
    return base('La disponibilidad cambió. Vuelve a validar la venta.', {
      conflicto: true,
      disponibilidadCambiada: true,
    });
  }
  if (texto.includes('completada')) {
    return base('Esta venta no está disponible para devolución.', {
      conflicto: true,
    });
  }
  if (texto.includes('estado')) {
    return base(
      'La devolución no está en un estado que permita esta operación.',
      { conflicto: true },
    );
  }
  if (texto.includes('prendas') || texto.includes('items')) {
    return base('La devolución no tiene prendas registradas.', {
      conflicto: true,
    });
  }

  return base(porDefecto, { conflicto: true });
}

/** Errores del listado de devoluciones. */
export function traducirErrorListadoDevoluciones(
  error: unknown,
): ErrorDevolucion {
  return traducir(error, {
    noEncontrada: 'No encontramos el listado solicitado.',
    conflicto: 'No pudimos obtener el listado de devoluciones.',
  });
}

/** Errores de `GET /devoluciones/ventas/{id}/disponibilidad`. */
export function traducirErrorDisponibilidadVenta(
  error: unknown,
): ErrorDevolucion {
  return traducir(error, {
    noEncontrada: 'Venta no encontrada.',
    conflicto: 'Esta venta no está disponible para devolución.',
    sinPermiso: 'No tienes autorización para gestionar esta venta.',
    red: 'No pudimos validar la venta.',
  });
}

/** Errores del registro (`POST /devoluciones`). */
export function traducirErrorRegistroDevolucion(
  error: unknown,
): ErrorDevolucion {
  return traducir(error, {
    noEncontrada: 'No encontramos la venta o la prenda indicada.',
    conflicto: 'No pudimos registrar la devolución.',
    datosInvalidos: 'Revisa los datos ingresados.',
  });
}

/** Errores del detalle (`GET /devoluciones/{id}`). */
export function traducirErrorDetalleDevolucion(
  error: unknown,
): ErrorDevolucion {
  return traducir(error, {
    noEncontrada: 'No encontramos esta devolución.',
    conflicto: 'Esta devolución no está disponible para consulta.',
  });
}

/** Errores de las acciones (aprobar/rechazar/procesar). */
export function traducirErrorAccionDevolucion(
  error: unknown,
): ErrorDevolucion {
  return traducir(error, {
    noEncontrada: 'No encontramos esta devolución.',
    conflicto:
      'La devolución no está en un estado que permita esta operación.',
  });
}
