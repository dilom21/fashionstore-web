import { isPlatformBrowser } from '@angular/common';
import {
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { PLATFORM_ID, inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  SAAS_RUTA_LOGIN,
  esModoSaas,
  esSuperficieUnificada,
} from '../saas.config';
import { SaasSessionService } from '../services/saas-session.service';

/**
 * Error tipado que devuelve el interceptor SaaS cuando una petición intenta
 * alcanzar una ruta legacy del backend con el modo SaaS activo.
 *
 * La petición NO llega al backend: se corta en el cliente y la UI muestra
 * "Ruta no disponible en modo SaaS.".
 */
export class SaasRutaLegacyBloqueadaError extends Error {
  /** Ruta de API bloqueada (sin query string), p. ej. `/ventas/presencial`. */
  readonly ruta: string;

  constructor(ruta: string) {
    super(`Ruta no disponible en modo SaaS: ${ruta}`);
    this.name = 'SaasRutaLegacyBloqueadaError';
    this.ruta = ruta;
  }
}

/** Rutas de autenticación tenant que nunca deben llevar `Authorization`. */
const RUTAS_SIN_TOKEN = new Set([
  '/auth/tenant/login',
  '/auth/tenant/invitaciones/aceptar',
]);

/** Normaliza la URL base de la API (sin barras finales). */
export function normalizarApiUrl(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, '');
}

/**
 * Devuelve la ruta (sin query string) de una URL que pertenece a la API
 * configurada, o `null` si la URL es de otro dominio/CDN.
 */
export function rutaDeApiPropia(url: string, apiUrl: string): string | null {
  const base = normalizarApiUrl(apiUrl);
  if (!url.startsWith(base)) {
    return null;
  }
  const resto = url.slice(base.length);
  return resto.split('?')[0] || '/';
}

/** `true` si la ruta no debe recibir el JWT tenant (login y aceptar invitación). */
export function esRutaExentaDeToken(ruta: string): boolean {
  return RUTAS_SIN_TOKEN.has(ruta);
}

/**
 * `true` si la ruta está migrada al modo SaaS.
 *
 * Solo se permiten `/tenant/**`, `/auth/tenant/**` y las rutas de salud. Cualquier
 * otra ruta de la API es legacy y se bloquea en el cliente, salvo en la
 * superficie unificada, donde se deja pasar sin token tenant.
 */
export function esRutaPermitidaSaas(ruta: string): boolean {
  if (ruta === '/' || ruta === '/health') {
    return true;
  }
  return (
    ruta === '/tenant' ||
    ruta.startsWith('/tenant/') ||
    ruta === '/auth/tenant' ||
    ruta.startsWith('/auth/tenant/')
  );
}

/** Opciones del interceptor (la detección de modo se puede sustituir en tests). */
export interface OpcionesInterceptorSaas {
  /** Fuente del flag de modo SaaS. Por defecto, `environment.saasMode`. */
  modoSaas?: () => boolean;
  /**
   * Fuente del flag de superficie unificada. Por defecto,
   * `esSuperficieUnificada()` (modo SaaS + `saasLegacySurface`).
   */
  superficieUnificada?: () => boolean;
}

/**
 * Construye el interceptor funcional del modo SaaS.
 *
 * Orden de decisiones:
 * 1. Modo legacy → no-op absoluto.
 * 2. URL externa (no empieza por `environment.apiUrl`) → pasa intacta.
 * 3. Ruta no migrada (`/tenant/**`, `/auth/tenant/**`, `/health`, `/`) →
 *    `SaasRutaLegacyBloqueadaError` sin emitir HTTP. En la superficie
 *    unificada el backend sirve también esas rutas legacy, así que se dejan
 *    pasar intactas (sin token tenant: las firma `auth.interceptor`).
 * 4. Login / aceptar invitación → nunca llevan `Authorization`.
 * 5. Resto → `Authorization: Bearer <token tenant>` si existe.
 * 6. 401 → marca `expirada`, limpia la sesión y navega a `/saas/login`.
 */
export function crearInterceptorSaas(
  opciones: OpcionesInterceptorSaas = {},
): HttpInterceptorFn {
  const modoSaas = opciones.modoSaas ?? esModoSaas;
  const superficieUnificada =
    opciones.superficieUnificada ?? esSuperficieUnificada;

  return (req: HttpRequest<unknown>, next) => {
    if (!modoSaas()) {
      return next(req);
    }

    const ruta = rutaDeApiPropia(req.url, environment.apiUrl);
    if (ruta === null) {
      return next(req);
    }

    if (!esRutaPermitidaSaas(ruta)) {
      // Superficie unificada: las rutas legacy son legítimas (las publica el
      // mismo despliegue), así que no se cortan; se pasan sin tocar para que
      // conserve su propia autorización y no se trate un 401 legacy como
      // sesión de empresa expirada.
      if (superficieUnificada()) {
        return next(req);
      }
      return throwError(() => new SaasRutaLegacyBloqueadaError(ruta));
    }

    const sesion = inject(SaasSessionService);
    const router = inject(Router);
    const platformId = inject(PLATFORM_ID);

    const exenta = esRutaExentaDeToken(ruta);
    const token = exenta ? null : sesion.token();
    const solicitud =
      token !== null && token.length > 0
        ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
        : req;

    return next(solicitud).pipe(
      catchError((error: unknown) => {
        // Un 401 en login/invitación es credencial inválida, no sesión expirada.
        if (
          !exenta &&
          error instanceof HttpErrorResponse &&
          error.status === 401
        ) {
          sesion.marcarExpirada();
          sesion.cerrarSesion();

          // Solo en navegador y sin repetir la navegación si ya estamos ahí.
          if (
            isPlatformBrowser(platformId) &&
            !router.url.startsWith(SAAS_RUTA_LOGIN)
          ) {
            // Sin `await`: el 401 ya se propaga; un fallo de navegación no debe
            // generar un rechazo no controlado.
            router.navigateByUrl(SAAS_RUTA_LOGIN).catch(() => undefined);
          }
        }
        return throwError(() => error);
      }),
    );
  };
}

/** Interceptor del modo SaaS registrado en `app.config.ts`. */
export const saasInterceptor: HttpInterceptorFn = crearInterceptorSaas();
