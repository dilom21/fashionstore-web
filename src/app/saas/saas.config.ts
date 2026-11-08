import { environment } from '../../environments/environment';

/**
 * Configuración compartida del modo SaaS (multiempresa).
 *
 * Centraliza las claves de almacenamiento, la detección del modo y los
 * prefijos de rutas públicas para que interceptor, guards, shell y páginas no
 * repitan literales.
 */

/**
 * Claves de `sessionStorage` EXCLUSIVAS del modo SaaS.
 *
 * Nunca coinciden con las claves del modo legacy (`vanter_access_token`): una
 * sesión de empresa y una sesión legacy pueden convivir en la misma pestaña sin
 * sobrescribirse.
 */
export const SAAS_STORAGE_KEYS = {
  /** JWT emitido por `POST /auth/tenant/login`. */
  token: 'fashionstore_saas_tenant_access_token',
  /** Slug de la empresa con la que se abrió la sesión (autocompletar login). */
  empresaSlug: 'vanter_saas_empresa_slug',
  /** Correo del usuario (autocompletar login; NUNCA la contraseña). */
  correo: 'vanter_saas_correo',
} as const;

/** Prefijo raíz de la SPA en modo SaaS. */
export const SAAS_PREFIJO = '/saas';

/** Rutas públicas del modo SaaS (no requieren sesión de empresa). */
export const SAAS_RUTAS_PUBLICAS = [
  `${SAAS_PREFIJO}/login`,
  `${SAAS_PREFIJO}/invitacion`,
  `${SAAS_PREFIJO}/sin-permiso`,
  `${SAAS_PREFIJO}/no-disponible`,
] as const;

/** Destino de login del modo SaaS. */
export const SAAS_RUTA_LOGIN = `${SAAS_PREFIJO}/login`;

/**
 * Módulos P1 del negocio que todavía NO tienen endpoint tenant.
 *
 * Se muestran en la navegación como deshabilitados ("Próx.") y sus rutas
 * apuntan a la pantalla genérica de módulo pendiente. El orden es el de la
 * navegación.
 *
 * `inventario` y `proveedores` ya NO están aquí: `inventario` consume
 * `GET /tenant/inventario` y `proveedores` usa el catálogo tenant más
 * `POST /tenant/proveedores` y `PUT /tenant/proveedores/{id}/productos`.
 */
export const SAAS_MODULOS_P1_SIN_ENDPOINT = [
  'movimientos-inventario',
  'promociones',
  'temporadas',
  'colecciones',
  'tallas',
  'colores',
  'ciudades',
  'pagos',
  'reportes',
  'bitacora',
  'asistencia-inteligente',
  'vestidor-virtual',
  'ventas-digital',
  'comprobantes',
] as const;

/** Identificador de un módulo P1 sin endpoint tenant. */
export type SaasModuloP1 = (typeof SAAS_MODULOS_P1_SIN_ENDPOINT)[number];

/**
 * `true` si el bundle actual se compiló en modo SaaS.
 *
 * Se lee de `environment`, que `angular.json` reemplaza por
 * `environment.saas-local.ts` solo con `--configuration saas-local`. El modo
 * legacy (por defecto en `ng build` / `ng serve`) devuelve `false`.
 */
export function esModoSaas(): boolean {
  return environment.saasMode === true;
}

/**
 * `true` si el bundle publica la SUPERFICIE UNIFICADA.
 *
 * Solo puede darse en un build SaaS (`saasMode`), porque el flag amplía la
 * tabla de rutas SaaS con las rutas legacy: el sitio legacy vive en `/` y el
 * panel de empresa en `/saas`, ambos contra la misma API. En ese caso los
 * interceptores dejan de bloquear los endpoints legacy, que son legítimos.
 *
 * Se activa únicamente con `--configuration saas-unified`
 * (`environment.saas-unified.ts`).
 */
export function esSuperficieUnificada(): boolean {
  return esModoSaas() && environment.saasLegacySurface === true;
}

/**
 * `true` si la URL interna indicada es una ruta pública del modo SaaS.
 *
 * Acepta tanto `/saas/login` como `saas/login`, y descarta query string y
 * fragmento (`/saas/invitacion?token=abc`).
 */
export function esRutaPublicaSaas(url: string): boolean {
  const ruta = normalizarRuta(url);
  return SAAS_RUTAS_PUBLICAS.some(
    (publica) => ruta === publica || ruta.startsWith(`${publica}/`),
  );
}

/** Normaliza una ruta interna: antepone `/`, quita query, fragmento y `/` final. */
export function normalizarRuta(url: string): string {
  const sinQuery = url.split('?')[0].split('#')[0];
  const conBarra = sinQuery.startsWith('/') ? sinQuery : `/${sinQuery}`;
  return conBarra.length > 1 ? conBarra.replace(/\/+$/, '') : conBarra;
}
