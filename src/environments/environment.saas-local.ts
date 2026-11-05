/**
 * Entorno del puente SaaS LOCAL (multiempresa).
 *
 * Este archivo NO se usa por defecto: Angular lo sustituye por
 * `environment.ts` únicamente al compilar con `--configuration saas-local`
 * (ver `fileReplacements` en `angular.json`). Conserva la MISMA forma que
 * `environment.ts` para que ningún servicio necesite ramas de importación.
 *
 * Backend SaaS local: FastAPI levantado aparte en http://127.0.0.1:8010
 */
export const environment = {
  apiUrl: 'http://127.0.0.1:8010/',
  /**
   * Publishable key de Stripe (CU22 - pago electrónico).
   *
   * SOLO se admite una clave pública `pk_test_...` / `pk_live_...`. Se mantiene
   * el mismo valor que el entorno legacy: en modo SaaS el cobro electrónico
   * todavía no está migrado.
   */
  stripePublishableKey: 'pk_test_51Tfgj0DdEv4wsBnrWOJvTeO3QJcd86s8zY7W4riOWjhxeEbqRAEsikJ0YZh6IskMfmF3LTiY1L5fHTMPvVLPzYe300Ri7JZOmT',

  /** Modo SaaS activo: protege rutas, sesión e interceptor de tenant. */
  saasMode: true,

  /**
   * Superficie unificada desactivada: este entorno expone SOLO el panel SaaS en
   * `/saas`. Solo tiene sentido cuando `saasMode` es `true`.
   */
  saasLegacySurface: false,

  /** Nombre legible del entorno activo. */
  saasNombreEntorno: 'saas-local',
};
