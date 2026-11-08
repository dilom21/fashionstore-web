/**
 * Entorno de la aplicación.
 *
 * URL base del backend FastAPI (FashionStore / VANTER MEN), centralizada aquí.
 * Todos los servicios construyen sus peticiones como `environment.apiUrl` +
 * ruta del endpoint; ningún servicio escribe el host directamente.
 *
 * Desarrollo local: backend FastAPI levantado con Uvicorn en http://127.0.0.1:8000
 */
export const environment = {
  apiUrl: 'http://127.0.0.1:8000',
  //apiUrl: 'https://fashionstore-api-qv8n.onrender.com/',
  /**
   * Publishable key de Stripe (CU22 - pago electrónico).
   *
   * SOLO se admite una clave pública `pk_test_...` / `pk_live_...`. NUNCA
   * colocar aquí `sk_test_...` ni `whsec_...`: los secretos viven únicamente
   * en el backend.
   *
   * Se deja VACÍA a propósito: no se inventa una clave falsa. Mientras no
   * exista una `pk_test` real, la página de pago muestra un mensaje de
   * configuración y la prueba E2E Stripe Test Mode queda pendiente.
   */
  stripePublishableKey: 'pk_test_51Tfgj0DdEv4wsBnrWOJvTeO3QJcd86s8zY7W4riOWjhxeEbqRAEsikJ0YZh6IskMfmF3LTiY1L5fHTMPvVLPzYe300Ri7JZOmT',

  /**
   * Modo SaaS (multiempresa) del frontend.
   *
   * - `false` (valor por defecto y de `ng build` / `ng serve`): modo legacy
   *   actual, sin cambios de comportamiento.
   * - `true`: solo se compila con `--configuration saas-local`, que reemplaza
   *   este archivo por `environment.saas-local.ts`.
   */
  saasMode: false,

  /**
   * Superficie unificada: la MISMA compilación publica el sitio legacy en `/` y
   * el panel SaaS en `/saas`.
   *
   * Solo tiene sentido cuando `saasMode` es `true`: el modo legacy puro ignora
   * el flag, porque su tabla de rutas no registra la rama `saas`. Con `false`
   * en un build SaaS el comportamiento es el de siempre (solo `/saas`).
   */
  saasLegacySurface: false,

  /** Nombre legible del entorno activo (diagnóstico y cabeceras de UI). */
  saasNombreEntorno: 'legacy',
};

