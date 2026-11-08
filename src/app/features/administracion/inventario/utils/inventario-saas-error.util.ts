import { HttpErrorResponse, HttpStatusCode } from '@angular/common/http';

/** Resultado de traducir un error HTTP de los endpoints de CU08 (SaaS). */
export interface ErrorInventarioSaas {
  mensaje: string;
  /**
   * true SOLO cuando el backend rechaza el JWT empresarial (401): la sesión ya
   * no sirve y hay que volver a iniciar sesión. Un 403, un 404, un 422, un 503
   * o un fallo de conexión NO expulsan al usuario.
   */
  sesionExpirada: boolean;
}

/** Recurso consultado: cambia solo el texto mostrado, nunca la interpretación. */
export type RecursoInventarioSaas = 'inventario' | 'movimientos' | 'filtros';

/** Sujeto gramatical de cada recurso, para los mensajes. */
const SUJETO: Record<RecursoInventarioSaas, string> = {
  inventario: 'el inventario',
  movimientos: 'los movimientos de inventario',
  filtros: 'las opciones de los filtros',
};

/**
 * Traduce los errores de los endpoints EMPRESARIALES de CU08
 * (`/tenant/inventario/**`, `/tenant/catalogo/categorias`,
 * `/tenant/empresa/sucursales`).
 *
 * A diferencia de la traducción legacy, aquí un 401 SÍ significa que la sesión
 * empresarial no es válida (el token se envía en cada consulta), por lo que se
 * marca `sesionExpirada`. El resto de códigos se informan como error, sin
 * convertirlos en una lista vacía aparentemente válida:
 *
 * 401 -> sesión empresarial inválida o expirada
 * 403 -> rol sin autorización para ese recurso
 * 404 -> sucursal o recurso inexistente en la empresa
 * 422 -> parámetros/filtros inválidos
 * 503 -> servicio empresarial no disponible (NO cierra sesión)
 * 0   -> error de conexión
 */
export function traducirErrorInventarioSaas(
  error: unknown,
  recurso: RecursoInventarioSaas = 'inventario',
): ErrorInventarioSaas {
  if (error instanceof HttpErrorResponse) {
    switch (error.status) {
      case HttpStatusCode.Unauthorized:
        return {
          mensaje:
            'Tu sesión empresarial no es válida o expiró. Vuelve a iniciar sesión.',
          sesionExpirada: true,
        };
      case HttpStatusCode.Forbidden:
        return {
          mensaje: `Tu rol en la empresa no tiene autorización para consultar ${SUJETO[recurso]}.`,
          sesionExpirada: false,
        };
      case HttpStatusCode.NotFound:
        return {
          mensaje:
            'La sucursal o el recurso solicitado no existe en tu empresa. Ajusta los filtros e inténtalo nuevamente.',
          sesionExpirada: false,
        };
      case HttpStatusCode.UnprocessableEntity:
        return {
          mensaje:
            'Los filtros enviados no son válidos para el servicio empresarial. Ajusta la búsqueda e inténtalo nuevamente.',
          sesionExpirada: false,
        };
      case HttpStatusCode.ServiceUnavailable:
        return {
          mensaje: `El servicio empresarial de ${SUJETO[recurso]} no está disponible en este momento. Inténtalo más tarde.`,
          sesionExpirada: false,
        };
      default:
        if (error.status === 0) {
          return {
            mensaje:
              'No pudimos conectarnos con el servicio empresarial. Revisa tu conexión e inténtalo nuevamente.',
            sesionExpirada: false,
          };
        }
        if (error.status >= 500) {
          return {
            mensaje: `El servicio empresarial de ${SUJETO[recurso]} no está disponible en este momento. Inténtalo más tarde.`,
            sesionExpirada: false,
          };
        }
    }
  }
  return {
    mensaje: `No se pudo consultar ${SUJETO[recurso]}. Inténtalo nuevamente.`,
    sesionExpirada: false,
  };
}
