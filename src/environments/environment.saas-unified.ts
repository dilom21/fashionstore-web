/**
 * Entorno de la REDESPLEGABILIDAD unificada (sitio único, API única).
 *
 * Este archivo NO se usa por defecto: Angular lo sustituye por
 * `environment.ts` únicamente al compilar con `--configuration saas-unified`
 * (ver `fileReplacements` en `angular.json`). Conserva la MISMA forma que
 * `environment.ts` para que ningún servicio necesite ramas de importación.
 *
 * Qué cambia respecto de los otros entornos:
 * - Un solo despliegue sirve el sitio legacy en `/` y el panel SaaS en `/saas`.
 * - Ambos hablan con el MISMO backend ya desplegado, que corre con
 *   `SAAS_AUTH_ENABLED=true` y `LEGACY_SURFACE_ENABLED=true`; por eso ninguna
 *   superficie bloquea las rutas de la otra.
 *
 * Backend: FastAPI en Render (servicio `fashionstore-api-qv8n`).
 */
export const environment = {
  apiUrl: 'https://fashionstore-api-qv8n.onrender.com/',
  /**
   * Publishable key de Stripe (CU22 - pago electrónico).
   *
   * SOLO se admite una clave pública `pk_test_...` / `pk_live_...`. Se mantiene
   * el mismo valor que el entorno legacy: el cobro electrónico es una función
   * del sitio público, no del panel multiempresa.
   */
  stripePublishableKey: 'pk_test_51Tfgj0DdEv4wsBnrWOJvTeO3QJcd86s8zY7W4riOWjhxeEbqRAEsikJ0YZh6IskMfmF3LTiY1L5fHTMPvVLPzYe300Ri7JZOmT',

  /** Modo SaaS activo: protege rutas, sesión e interceptor de tenant. */
  saasMode: true,

  /**
   * Superficie unificada activa: el bundle registra AMBAS tablas de rutas
   * (legacy en `/` y SaaS en `/saas`) y los interceptores dejan de bloquear las
   * rutas legacy. Solo tiene sentido junto con `saasMode: true`.
   */
  saasLegacySurface: true,

  /** Nombre legible del entorno activo. */
  saasNombreEntorno: 'saas-unified',
};
