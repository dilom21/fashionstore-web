import { HttpErrorResponse } from '@angular/common/http';

import { traducirErrorHttp } from '../../usuarios/utils/http-error.util';

/** Resultado de traducir un error HTTP para las pantallas de CU12. */
export interface ErrorOrdenesCompra {
  mensaje: string;
  /** true cuando el backend devuelve 401 (sesión expirada/inválida). */
  sesionExpirada: boolean;
  /** Código HTTP real, útil para distinguir 403/404/409/422. */
  codigo: number | null;
}

/**
 * Extrae el detalle textual que FastAPI envía en `detail`.
 *
 * - Errores de negocio: `{"detail": "mensaje"}` (400/403/404/409).
 * - Errores de validación: `{"detail": [{"loc": ..., "msg": ..., ...}]}` (422).
 */
function detalleBackend(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  if (typeof error.error !== 'object' || error.error === null) {
    return null;
  }

  const cuerpo = error.error as { detail?: unknown };
  const detalle = cuerpo.detail;

  if (typeof detalle === 'string' && detalle.trim().length > 0) {
    return detalle.trim();
  }

  if (Array.isArray(detalle)) {
    const mensajes = detalle
      .map((item) => {
        if (
          typeof item === 'object' &&
          item !== null &&
          'msg' in item &&
          typeof (item as { msg: unknown }).msg === 'string'
        ) {
          return (item as { msg: string }).msg.trim();
        }
        return null;
      })
      .filter((mensaje): mensaje is string => mensaje !== null);

    if (mensajes.length > 0) {
      return mensajes.join(' ');
    }
  }

  return null;
}

/**
 * Traduce errores HTTP del backend para CU12.
 *
 * Se prefiere siempre el `detail` legible del backend porque describe la regla
 * real: orden sin detalles (409), transición inválida (409), producto no
 * asociado al proveedor (409), variante/temporada inactiva (409), orden ya
 * recibida (409), editar detalles después de enviar (409), sin permiso para
 * cancelar (403), sucursal ajena (403), recurso inexistente (404) o validación
 * (422/400). Los estados globales de sesión (401) conservan el mensaje base.
 */
export function traducirErrorOrdenesCompra(error: unknown): ErrorOrdenesCompra {
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
