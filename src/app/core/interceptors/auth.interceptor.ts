import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../features/autenticacion-seguridad/auth/services/auth.service';

/**
 * Endpoints de login: no deben recibir un JWT previo mientras el usuario
 * intenta autenticarse de nuevo, para mantener la petición limpia.
 */
const RUTAS_LOGIN_SIN_TOKEN = new Set([
  '/auth/clientes/login',
  '/auth/personal/login',
  '/auth/tenant/login',
]);

/**
 * Prefijos de la API que pertenecen al contexto EMPRESARIAL (SaaS).
 *
 * Estas peticiones nunca reciben el JWT legacy: el JWT tenant lo añade
 * `TenantApiService` en su propia cabecera Authorization. Si el servicio aún
 * no tiene token, la petición debe salir sin credenciales (el backend
 * responderá 401) en lugar de viajar con la sesión legacy de un cliente o de
 * un usuario de personal antiguo.
 */
const PREFIJOS_API_SAAS = ['/auth/tenant', '/tenant'];
const TOKEN_TENANT = 'fashionstore_saas_tenant_access_token';

/** true si la ruta de la API pertenece al contexto empresarial (SaaS). */
function esRutaSaas(ruta: string): boolean {
  return PREFIJOS_API_SAAS.some(
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
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const ruta = rutaDeApiPropia(req.url);

  // Dominio externo: no tocar la petición.
  if (ruta === null) {
    return next(req);
  }

  // Endpoints de login: no enviar un token viejo.
  if (RUTAS_LOGIN_SIN_TOKEN.has(ruta)) {
    return next(req);
  }

  // Contexto empresarial (SaaS): solo el JWT tenant. Nunca el legacy.
  if (esRutaSaas(ruta)) {
    // Los servicios del dashboard original usan HttpClient directamente. Les
    // damos el JWT empresarial sin mezclarlo con el token legacy; el backend
    // sigue siendo la autoridad final para rol, empresa y permiso.
    if (!req.headers.has('Authorization')) {
      const token =
        typeof sessionStorage !== 'undefined'
          ? sessionStorage.getItem(TOKEN_TENANT)
          : null;
      if (token) {
        return next(
          req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }),
        );
      }
    }
    return next(req);
  }

  // CU03: no sobreescribir el JWT empresarial que ya envía el servicio
  // SaaS. La sesión legacy nunca puede sustituir la identidad tenant.
  if (req.headers.has('Authorization')) {
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
