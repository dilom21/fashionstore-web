/**
 * Entorno de la aplicación.
 *
 * URL base del backend FastAPI (FashionStore / VANTER MEN), centralizada aquí.
 * Todos los servicios construyen sus peticiones como `environment.apiUrl` +
 * ruta del endpoint; ningún servicio escribe el host directamente.
 *
 * PRODUCCIÓN SaaS: FastAPI público en AWS EC2 mediante HTTPS.
 * Las funciones del cliente que dependan de autorizaciones/flags siguen
 * sujetas al backend: este modo no habilita reservas, pagos ni offline.
 */
export const environment = {
  apiUrl: 'https://fashionstore-api.duckdns.org',
  saasMode: true,
  saasNombreEntorno: 'saas-produccion',
  /**
   * Identificador público (slug) de la EMPRESA que representa esta tienda.
   *
   * Selecciona el catálogo público de Vanter Men en
   * `/catalogo/public/vanter-men/{productos,filtros}`. La autenticación de
   * clientes sigue utilizando la empresa seleccionada en el formulario y
   * verificada por FastAPI; este slug no concede ningún permiso.
   *
   * Valor real del tenant sembrado por las migraciones SaaS del backend
   * (`database/saas/preparacion_pg17/010_saas_core_vanter.sql`).
   *
   * LIMITACIÓN: una compilación sirve una sola tienda/empresa. Atender varias
   * tiendas con el mismo despliegue requeriría resolver la empresa por
   * subdominio/dominio verificado (fuera del alcance actual).
   */
  empresaSlug: 'vanter-men',
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
};

