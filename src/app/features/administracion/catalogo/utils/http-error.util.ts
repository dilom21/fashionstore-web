import { HttpErrorResponse } from '@angular/common/http';

import { traducirErrorHttp } from '../../usuarios/utils/http-error.util';

/** Resultado de traducir un error HTTP para las pantallas de Catálogo (CU07). */
export interface ErrorCatalogo {
  mensaje: string;
  /** true cuando el backend devuelve 401 (sesión expirada/inválida). */
  sesionExpirada: boolean;
  /** Código HTTP real, útil para distinguir 409 (conflicto) de 422. */
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
 * Traduce errores HTTP del backend reutilizando la utilidad de CU03.
 *
 * Cuando FastAPI envía un `detail` legible (400/404/409/422) se prefiere ese
 * mensaje, porque describe la regla real del backend: SKU duplicado,
 * combinación producto+talla+color duplicada, categoría con productos activos,
 * talla/color con variantes activas, etc. Los estados globales (401/403/red)
 * conservan el mensaje de CU03.
 */
export function traducirErrorCatalogo(error: unknown): ErrorCatalogo {
  const codigo = error instanceof HttpErrorResponse ? error.status : null;
  const base = traducirErrorHttp(error);

  if (base.sesionExpirada) {
    return { mensaje: base.mensaje, sesionExpirada: true, codigo };
  }

  const detalle = detalleBackend(error);
  if (detalle !== null) {
    return { mensaje: detalle, sesionExpirada: false, codigo };
  }

  return { mensaje: base.mensaje, sesionExpirada: false, codigo };
}
