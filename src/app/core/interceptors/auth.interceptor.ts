import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../features/autenticacion-seguridad/auth/services/auth.service';
import { esSuperficieUnificada } from '../../saas/saas.config';

/**
 * Endpoints de login: no deben recibir un JWT previo mientras el usuario
 * intenta autenticarse de nuevo, para mantener la petición limpia.
 */
const RUTAS_LOGIN_SIN_TOKEN = new Set([
  '/auth/clientes/login',
  '/auth/personal/login',
]);

/**
 * Prefijos de la API que pertenecen al dominio de empresa (tenant).
 *
 * Nunca reciben el JWT legacy: en la superficie unificada un mismo backend
 * atiende las dos caras y el token de una no debe viajar hacia la otra.
 */
const RUTAS_TENANT_SIN_TOKEN_LEGACY = ['/auth/tenant', '/tenant'];

/** `true` si la ruta de API pertenece al dominio multiempresa (tenant). */
function esRutaTenant(ruta: string): boolean {
  return RUTAS_TENANT_SIN_TOKEN_LEGACY.some(
    (prefijo) => ruta === prefijo || ruta.startsWith(`${prefijo}/`),
  );
}

/**
 * Devuelve la ruta (sin query string) de una URL que pertenece a la API propia,
 * o null si la URL apunta a un dominio externo.
 */
function rutaDeApiPropia(url: string): string | null {
  const apiUrlNormalizada = environment.apiUrl.replace(/\/+$/, '');
  if (!url.startsWith(apiUrlNormalizada)) {
    return null;
  }
  const resto = url.slice(apiUrlNormalizada.length);
  return resto.split('?')[0] || '/';
}

/**
 * Interceptor funcional de autenticación.
 *
 * Agrega `Authorization: Bearer <token>` únicamente a las peticiones dirigidas
 * a `environment.apiUrl`. Las peticiones a dominios externos (CDNs, imágenes,
 * APIs de terceros, etc.) nunca reciben el JWT.
 *
 * En la superficie unificada (sitio legacy + panel SaaS en el mismo despliegue)
 * el JWT legacy se sigue adjuntando a las rutas legacy, pero jamás a las rutas
 * de empresa (`/auth/tenant/**` y `/tenant/**`), que llevan su propio token
 * desde `saas.interceptor`.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Modo SaaS puro: el token tenant lo gestiona `saas.interceptor`; el JWT
  // legacy no debe viajar nunca en este modo.
  if (environment.saasMode && !esSuperficieUnificada()) {
    return next(req);
  }

  const ruta = rutaDeApiPropia(req.url);

  // Dominio externo: no tocar la petición.
  if (ruta === null) {
    return next(req);
  }

  // Endpoints de login: no enviar un token viejo.
  if (RUTAS_LOGIN_SIN_TOKEN.has(ruta)) {
    return next(req);
  }

  // Rutas de empresa: su token lo aporta el interceptor SaaS.
  if (esRutaTenant(ruta)) {
    return next(req);
  }

  const authService = inject(AuthService);
  const token = authService.obtenerToken();
  if (!token) {
    return next(req);
  }

  const requestConAutorizacion = req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  });
  return next(requestConAutorizacion);
};