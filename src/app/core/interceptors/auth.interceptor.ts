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
]);

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