import { HttpErrorResponse } from '@angular/common/http';

import { traducirErrorHttp } from '../../usuarios/utils/http-error.util';

/** Resultado de traducir un error HTTP para las pantallas de CU11. */
export interface ErrorProveedores {
  mensaje: string;
  /** true cuando el backend devuelve 401 (sesión expirada/inválida). */
  sesionExpirada: boolean;
  /** Código HTTP real, útil para distinguir 409 (conflicto) de 422. */
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
 * Traduce errores HTTP del backend para CU11.
 *
 * Se prefiere siempre el `detail` legible del backend porque describe la regla
 * real: NIT duplicado (409), proveedor con órdenes de compra activas (409),
 * producto inexistente (404), producto inactivo (409), costo inválido (422) o
 * falta de permiso para deshabilitar (403). Los estados globales de sesión
 * (401) conservan el mensaje base de CU03.
 */
export function traducirErrorProveedores(error: unknown): ErrorProveedores {
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
