import { HttpErrorResponse } from '@angular/common/http';

/** Resultado de traducir un error HTTP en las pantallas públicas de catálogo. */
export interface ErrorPublico {
  mensaje: string;
  codigo: number | null;
}

/** Extrae el detalle textual que FastAPI envía en {"detail": "..."}. */
function detalleBackend(error: unknown): string | null {
  if (error instanceof HttpErrorResponse && typeof error.error === 'object') {
    const cuerpo = error.error as { detail?: unknown };
    if (typeof cuerpo.detail === 'string' && cuerpo.detail.trim().length > 0) {
      return cuerpo.detail.trim();
    }
  }
  return null;
}

/**
 * Traduce errores HTTP de los endpoints públicos de catálogo.
 *
 * A diferencia del panel administrativo, estas rutas no requieren JWT, por lo
 * que no se fuerza un cierre de sesión: solo se informa el problema y se
 * ofrece reintentar.
 */
export function traducirErrorPublico(
  error: unknown,
  contexto: string,
): ErrorPublico {
  const codigo = error instanceof HttpErrorResponse ? error.status : null;

  if (codigo === 0) {
    return {
      mensaje:
        'No se pudo conectar con el servidor. Verifica tu conexión e intenta nuevamente.',
      codigo,
    };
  }

  const detalle = detalleBackend(error);

  if (codigo === 404) {
    const detalleUtil =
      detalle !== null && detalle.toLowerCase() !== 'not found'
        ? detalle
        : null;
    return {
      mensaje: detalleUtil ?? 'No se encontró el recurso solicitado.',
      codigo,
    };
  }

  if (detalle !== null) {
    return { mensaje: detalle, codigo };
  }

  return {
    mensaje: `No se pudo ${contexto}. Intenta nuevamente en unos segundos.`,
    codigo,
  };
}
