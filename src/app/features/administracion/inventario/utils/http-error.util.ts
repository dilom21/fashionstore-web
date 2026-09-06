import { HttpErrorResponse } from '@angular/common/http';

import { traducirErrorHttp } from '../../usuarios/utils/http-error.util';

/** Resultado de traducir un error HTTP para las pantallas de Inventario (CU06). */
export interface ErrorInventario {
  mensaje: string;
  /** true cuando el backend devuelve 401 (sesión expirada/inválida). */
  sesionExpirada: boolean;
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
 * mensaje, porque describe la regla real del backend (p. ej. "La ciudad ya
 * existe", "Ya existe una sucursal con ese nombre en la ciudad", "La ciudad
 * no puede deshabilitarse porque tiene sucursales activas" o "La sucursal
 * tiene empleados activos o stock pendiente"). Los estados globales
 * (401/403/red) conservan el mensaje de CU03.
 */
export function traducirErrorInventario(error: unknown): ErrorInventario {
  const base = traducirErrorHttp(error);
  if (base.sesionExpirada) {
    return { mensaje: base.mensaje, sesionExpirada: true };
  }
  const detalle = detalleBackend(error);
  if (detalle !== null) {
    return { mensaje: detalle, sesionExpirada: false };
  }
  return { mensaje: base.mensaje, sesionExpirada: false };
}
