/** Configuración local explícita para validar el backend SaaS en 8000. */
export const environment = {
  apiUrl: 'http://127.0.0.1:8000',
  saasMode: true,
  saasNombreEntorno: 'saas-local',
  empresaSlug: 'vanter-men',
  /**
   * Publishable key pública de Stripe Test Mode (misma que el modo legacy).
   * Es una `pk_test_...` pública: nunca debe contener `sk_test_` ni `whsec_`.
   */
  stripePublishableKey: 'pk_test_51Tfgj0DdEv4wsBnrWOJvTeO3QJcd86s8zY7W4riOWjhxeEbqRAEsikJ0YZh6IskMfmF3LTiY1L5fHTMPvVLPzYe300Ri7JZOmT',
};
