import { HttpErrorResponse } from '@angular/common/http';

import {
  MENSAJE_ENDPOINT_LEGACY_BLOQUEADO,
  esLegacyBloqueadoPorSesionEmpresarial,
} from '../../../../core/sesion/sesion-panel';

/** Resultado de traducir un error HTTP a un mensaje amigable. */
export interface ErrorTraducido {
  mensaje: string;
  /** true cuando el backend devuelve 401 (sesión expirada/inválida). */
  sesionExpirada: boolean;
}

/**
 * Traduce errores HTTP del backend FastAPI a mensajes comprensibles para el
 * administrador. Nunca se exponen detalles técnicos ni stack traces.
 *
 * Mapeo según el contrato real de CU03:
 * 401 -> sesión inválida/expirada; 403 -> sin autorización;
 * 404 -> registro inexistente; 409 -> duplicado; 422 -> validación.
 *
 * Excepción deliberada para la sesión EMPRESARIAL (SaaS): un 401 producido por
 * un endpoint del sistema anterior significa "módulo todavía no adaptado al
 * multitenant", no una sesión expirada. En ese caso se informa la limitación y
 * `sesionExpirada` queda en false para no expulsar al administrador del panel.
 */
export function traducirErrorHttp(error: unknown): ErrorTraducido {
  if (error instanceof HttpErrorResponse) {
    switch (error.status) {
      case 401:
        if (esLegacyBloqueadoPorSesionEmpresarial()) {
          return {
            mensaje: MENSAJE_ENDPOINT_LEGACY_BLOQUEADO,
            sesionExpirada: false,
          };
        }
        return {
          mensaje: 'Tu sesión expiró. Vuelve a iniciar sesión.',
          sesionExpirada: true,
        };
      case 403:
        return {
          mensaje: 'No tienes permisos para realizar esta acción.',
          sesionExpirada: false,
        };
      case 404:
        return {
          mensaje: 'No se encontró el registro solicitado.',
          sesionExpirada: false,
        };
      case 409:
        return {
          mensaje:
            'El correo o el documento de identidad ya se encuentra registrado.',
          sesionExpirada: false,
        };
      case 422:
        return {
          mensaje:
            'Revisa los datos ingresados: algunos campos no son válidos o el rol está inactivo.',
          sesionExpirada: false,
        };
      default:
        if (error.status === 0 || error.status >= 500) {
          return {
            mensaje: 'No pudimos conectarnos con el servicio. Inténtalo nuevamente.',
            sesionExpirada: false,
          };
        }
    }
  }
  return {
    mensaje: 'Ocurrió un error inesperado. Inténtalo nuevamente.',
    sesionExpirada: false,
  };
}
