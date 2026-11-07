import { HttpErrorResponse } from '@angular/common/http';

import {
  MENSAJE_ENDPOINT_LEGACY_BLOQUEADO,
  esLegacyBloqueadoPorSesionEmpresarial,
} from '../../../core/sesion/sesion-panel';

/** Resultado de traducir un error HTTP de CU18. */
export interface ErrorAtencionReserva {
  mensaje: string;
  /** true cuando el backend devuelve 401 (sesión expirada/inválida). */
  sesionExpirada: boolean;
  /** true cuando la reserva dejó de estar disponible (409). */
  reservaNoDisponible: boolean;
}

/**
 * Traduce los errores del backend CU18 a mensajes comprensibles.
 *
 * Nunca se exponen mensajes SQL, trazas ni detalles internos.
 * 403 = rol fuera de la allowlist o reserva de otra sucursal;
 * 409 = la reserva ya no está CONFIRMADA/atendida;
 * 422 = selección inválida o rango de fechas invertido.
 */
export function traducirErrorAtencionReserva(
  error: unknown,
): ErrorAtencionReserva {
  const codigo = error instanceof HttpErrorResponse ? error.status : null;

  switch (codigo) {
    case 401:
      // Sesión empresarial: el 401 es un endpoint legacy no adaptado todavía.
      if (esLegacyBloqueadoPorSesionEmpresarial()) {
        return {
          mensaje: MENSAJE_ENDPOINT_LEGACY_BLOQUEADO,
          sesionExpirada: false,
          reservaNoDisponible: false,
        };
      }
      return {
        mensaje: 'Tu sesión expiró. Inicia sesión nuevamente.',
        sesionExpirada: true,
        reservaNoDisponible: false,
      };
    case 403:
      return {
        mensaje:
          'No tienes permisos para atender reservas (o la reserva pertenece a otra sucursal).',
        sesionExpirada: false,
        reservaNoDisponible: false,
      };
    case 404:
      return {
        mensaje: 'La reserva solicitada ya no existe.',
        sesionExpirada: false,
        reservaNoDisponible: true,
      };
    case 409:
      return {
        mensaje:
          'La reserva ya no se encuentra disponible para esta operación.',
        sesionExpirada: false,
        reservaNoDisponible: true,
      };
    case 422:
      return {
        mensaje:
          'Revisa la selección: las cantidades o los filtros enviados no son válidos.',
        sesionExpirada: false,
        reservaNoDisponible: false,
      };
    case 0:
      return {
        mensaje:
          'No se pudo conectar con el servidor. Verifica tu conexión e intenta nuevamente.',
        sesionExpirada: false,
        reservaNoDisponible: false,
      };
  }

  if (codigo !== null && codigo >= 500) {
    return {
      mensaje:
        'El servicio no está disponible en este momento. Intenta nuevamente.',
      sesionExpirada: false,
      reservaNoDisponible: false,
    };
  }

  return {
    mensaje:
      'No se pudo completar la operación con la reserva. Intenta nuevamente.',
    sesionExpirada: false,
    reservaNoDisponible: false,
  };
}
