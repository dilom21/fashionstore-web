import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';

import { SaasRutaLegacyBloqueadaError } from '../interceptors/saas.interceptor';
import {
  TenantErrorCuerpo,
  TenantErrorDetalleItem,
  TenantErrorNormalizado,
} from '../models/tenant.models';

/** Mensaje genérico cuando el backend no da detalle y no hay caso específico. */
const MENSAJE_GENERICO =
  'Ocurrió un error inesperado. Inténtalo nuevamente en unos momentos.';

/** Nombres legibles de los campos que valida el backend tenant. */
const ETIQUETAS_CAMPO: Record<string, string> = {
  correo: 'correo electrónico',
  password: 'contraseña',
  password_confirmacion: 'confirmación de contraseña',
  empresa_slug: 'slug de la empresa',
  contexto: 'contexto',
  token: 'token de invitación',
};

/**
 * Traduce los errores del backend tenant a mensajes de interfaz.
 *
 * Reglas del contrato:
 * - `detail` es STRING en 400/401/403/404/409/429/503.
 * - `detail` es una LISTA de `{type, loc, msg, input}` en 422.
 *
 * El texto del 422 se traduce a lenguaje claro y NUNCA se muestra `input`
 * (puede contener la contraseña enviada).
 */
@Injectable({ providedIn: 'root' })
export class SaasErrorService {
  /**
   * Mensaje listo para mostrar al usuario.
   *
   * @param err error capturado (normalmente `HttpErrorResponse`).
   * @param contexto etiqueta de diagnóstico (p. ej. 'login'), no se muestra.
   */
  mensajeDeError(err: unknown, contexto?: string): string {
    const normalizado = normalizarError(err, contexto);
    return normalizado.mensaje;
  }

  /** Versión estructurada del error (mensaje, campos, `Retry-After`). */
  normalizar(err: unknown, contexto?: string): TenantErrorNormalizado {
    return normalizarError(err, contexto);
  }
}

/**
 * Normaliza cualquier error a la forma que consume la UI.
 *
 * Es una función pura (sin Angular) para poder probarla directamente.
 */
export function normalizarError(
  err: unknown,
  contexto?: string,
): TenantErrorNormalizado {
  const vacio: TenantErrorNormalizado = {
    estado: 0,
    esValidacion: false,
    mensaje: MENSAJE_GENERICO,
    detalle: null,
    campos: [],
    reintentarEnSegundos: null,
  };

  if (err instanceof SaasRutaLegacyBloqueadaError) {
    return {
      ...vacio,
      mensaje: 'Ruta no disponible en modo SaaS.',
      detalle: conContexto(contexto, err.message),
    };
  }

  if (!(err instanceof HttpErrorResponse)) {
    const detalle =
      err instanceof Error && err.message.length > 0 ? err.message : null;
    return {
      ...vacio,
      mensaje: MENSAJE_GENERICO,
      detalle: conContexto(contexto, detalle),
    };
  }

  const estado = err.status;
  const cuerpo = leerCuerpo(err);
  const detalleString = detalleDeTexto(cuerpo);
  const items = detalleDeLista(cuerpo);
  const reintentarEnSegundos = segundosDeRetryAfter(err);

  // Sin red / sin respuesta del servidor.
  if (estado === 0) {
    return {
      ...vacio,
      estado: 0,
      mensaje: 'No pudimos conectarnos con el servicio.',
      detalle: conContexto(contexto, detalleString),
    };
  }

  // 422: validación de campos (detail es una lista).
  if (estado === 422) {
    const campos = camposDe(items);
    const mensaje =
      items.length > 0
        ? items.map((item) => traducirValidacion(item)).join(' ')
        : 'Revisa los datos ingresados: hay campos con errores.';
    return {
      estado,
      esValidacion: true,
      mensaje,
      detalle: conContexto(contexto, detalleString ?? textoCrudo(items)),
      campos,
      reintentarEnSegundos: null,
    };
  }

  const detalleBase = {
    estado,
    esValidacion: false,
    detalle: conContexto(contexto, detalleString),
    campos: [] as string[],
    reintentarEnSegundos,
  };

  switch (estado) {
    case 401:
      return {
        ...detalleBase,
        mensaje: 'Tu sesión expiró o no es válida. Vuelve a iniciar sesión.',
      };
    case 403:
      return {
        ...detalleBase,
        mensaje: detalleString ?? 'No tienes permiso para esta acción.',
      };
    case 404:
      return {
        ...detalleBase,
        mensaje: detalleString ?? 'El recurso no existe en esta empresa.',
      };
    case 409:
      return {
        ...detalleBase,
        mensaje:
          detalleString ??
          'La operación entra en conflicto con el estado actual de la empresa.',
      };
    case 429:
      return {
        ...detalleBase,
        mensaje:
          reintentarEnSegundos !== null
            ? `Demasiadas solicitudes. Intenta en ${reintentarEnSegundos} segundos.`
            : 'Demasiadas solicitudes. Intenta de nuevo en unos segundos.',
      };
    case 503:
      return {
        ...detalleBase,
        mensaje: 'Módulo no habilitado en esta versión o ruta no migrada.',
      };
    default:
      return {
        ...detalleBase,
        mensaje: detalleString ?? MENSAJE_GENERICO,
      };
  }
}

/** Cuerpo del error tal como lo entrega Angular (objeto, texto o `null`). */
function leerCuerpo(err: HttpErrorResponse): TenantErrorCuerpo | string | null {
  const cuerpo: unknown = err.error;
  if (typeof cuerpo === 'string') {
    return cuerpo;
  }
  if (cuerpo !== null && typeof cuerpo === 'object') {
    return cuerpo as TenantErrorCuerpo;
  }
  return null;
}

/** `detail` cuando llega como STRING (400/401/403/404/409/429/503). */
export function detalleDeTexto(
  cuerpo: TenantErrorCuerpo | string | null,
): string | null {
  if (typeof cuerpo === 'string') {
    const texto = cuerpo.trim();
    return texto.length > 0 ? texto : null;
  }
  if (cuerpo === null) {
    return null;
  }
  const detalle = cuerpo.detail;
  if (typeof detalle === 'string') {
    const texto = detalle.trim();
    return texto.length > 0 ? texto : null;
  }
  return null;
}

/** `detail` cuando llega como LISTA (422). */
export function detalleDeLista(
  cuerpo: TenantErrorCuerpo | string | null,
): TenantErrorDetalleItem[] {
  if (cuerpo === null || typeof cuerpo === 'string') {
    return [];
  }
  const detalle = cuerpo.detail;
  if (!Array.isArray(detalle)) {
    return [];
  }
  return detalle.filter(
    (item): item is TenantErrorDetalleItem =>
      item !== null &&
      typeof item === 'object' &&
      typeof (item as TenantErrorDetalleItem).msg === 'string',
  );
}

/** Segundos indicados por la cabecera `Retry-After` (solo formato numérico). */
export function segundosDeRetryAfter(err: HttpErrorResponse): number | null {
  if (err.status !== 429) {
    return null;
  }
  const valor = err.headers?.get('Retry-After') ?? null;
  if (valor === null) {
    return null;
  }
  const segundos = Number.parseInt(valor.trim(), 10);
  return Number.isFinite(segundos) && segundos >= 0 ? segundos : null;
}

/**
 * Traduce un item de validación 422 a lenguaje claro.
 *
 * Se ignoran `input` y `ctx` (pueden contener datos sensibles del formulario).
 */
export function traducirValidacion(item: TenantErrorDetalleItem): string {
  const campo = etiquetaCampo(item.loc);
  const tipo = item.type ?? '';
  const mensaje = (item.msg ?? '').trim();

  if (tipo === 'extra_forbidden') {
    return `El campo «${campo}» no está permitido en esta solicitud.`;
  }
  if (tipo === 'missing' || /^field required$/i.test(mensaje)) {
    return `El campo «${campo}» es obligatorio.`;
  }
  if (mensaje.length === 0) {
    return `Revisa el campo «${campo}».`;
  }
  return `«${campo}»: ${mensaje}.`;
}

/** Etiqueta legible del último segmento de `loc`. */
export function etiquetaCampo(loc: Array<string | number> | undefined): string {
  if (!Array.isArray(loc)) {
    return 'formulario';
  }
  const nombre = [...loc]
    .reverse()
    .find((parte): parte is string => typeof parte === 'string');
  if (nombre === undefined) {
    return 'formulario';
  }
  return ETIQUETAS_CAMPO[nombre] ?? nombre;
}

/** Nombres de campo implicados en una lista 422. */
function camposDe(items: TenantErrorDetalleItem[]): string[] {
  const campos = new Set<string>();
  for (const item of items) {
    const nombre = [...(item.loc ?? [])]
      .reverse()
      .find((parte): parte is string => typeof parte === 'string');
    if (nombre !== undefined) {
      campos.add(nombre);
    }
  }
  return [...campos];
}

/** Texto crudo de una lista 422, solo para diagnóstico. */
function textoCrudo(items: TenantErrorDetalleItem[]): string | null {
  if (items.length === 0) {
    return null;
  }
  return items.map((item) => `${item.type}: ${item.msg}`).join(' | ');
}

/** Prefija el contexto de diagnóstico al detalle crudo. */
function conContexto(contexto: string | undefined, detalle: string | null): string | null {
  if (contexto === undefined || contexto.trim().length === 0) {
    return detalle;
  }
  return detalle === null ? `[${contexto}]` : `[${contexto}] ${detalle}`;
}
