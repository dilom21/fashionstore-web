import { RenderMode, ServerRoute } from '@angular/ssr';

import { environment } from '../environments/environment';

/**
 * Rutas de servidor del modo legacy (comportamiento actual, sin cambios).
 *
 * Incluye el wildcard de prerender al final.
 */
export const rutasServidorLegacy: ServerRoute[] = [
  // Rutas privadas del personal: se renderizan por petición (no se prerenderizan).
  {
    path: 'dashboard',
    renderMode: RenderMode.Server,
  },
  {
    path: 'admin/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'auth/personal/login',
    renderMode: RenderMode.Server,
  },
  // Atención de reservas en sucursal (CU18): área operativa del personal
  // (ENCARGADO_SUCURSAL / CAJERO); requiere sesión, nunca se prerenderiza.
  {
    path: 'personal/**',
    renderMode: RenderMode.Server,
  },
  // Catálogo público (CU09): datos dinámicos, se renderiza por petición.
  {
    path: 'catalogo/**',
    renderMode: RenderMode.Server,
  },
  // Carrito del cliente (CU15): requiere sesión; nunca se prerenderiza.
  {
    path: 'carritos',
    renderMode: RenderMode.Server,
  },
  {
    path: 'carritos/**',
    renderMode: RenderMode.Server,
  },
  // Reservas del cliente (CU16): requieren sesión; nunca se prerenderizan.
  {
    path: 'reservas',
    renderMode: RenderMode.Server,
  },
  {
    path: 'reservas/**',
    renderMode: RenderMode.Server,
  },
  // Checkout de compra digital (CU19): requiere sesión y usa :carrito_id; se
  // renderiza por petición, nunca se prerenderiza.
  {
    path: 'checkout/**',
    renderMode: RenderMode.Server,
  },
  // Pago electrónico con Stripe (CU22): requiere sesión y usa :venta_id. Se
  // renderiza por petición; Stripe.js jamás se inicializa en el servidor.
  {
    path: 'pagos/**',
    renderMode: RenderMode.Server,
  },
  // Comprobante de venta (CU23): requiere sesión y usa :venta_id. Se renderiza
  // por petición; el PDF/impresión solo se ejecutan en el navegador.
  {
    path: 'ventas/**',
    renderMode: RenderMode.Server,
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];

/**
 * Rutas de servidor del modo SaaS.
 *
 * El ORDEN importa: Angular resuelve por la primera coincidencia, así que las
 * rutas públicas se declaran antes del comodín `saas/**`.
 *
 * - `saas/login` y `saas/invitacion` se renderizan en el servidor: son públicas
 *   y pintan datos del propio formulario (slug de empresa, mensajes de error).
 * - `saas/**` (el panel autenticado) se renderiza en CLIENTE. Sus guards
 *   (`saasTenantGuard`, `requierePermiso`) deciden con el JWT de
 *   `sessionStorage` y con la matriz de permisos, y ninguno de los dos existe
 *   en el servidor: renderizar el panel en SSR enviaba `302 /saas/login` a
 *   cualquier recarga o URL profunda (F5 perdía la sesión) además de arriesgar
 *   datos de tenant en el HTML inicial. El shell hidrata la sesión en el
 *   navegador con `GET /auth/tenant/me`.
 * - `**` sigue en `Server` para el resto (raíces y comodín del modo).
 */
export const rutasServidorSaas: ServerRoute[] = [
  {
    path: 'auth/personal/login',
    renderMode: RenderMode.Server,
  },
  {
    path: 'saas/login',
    renderMode: RenderMode.Server,
  },
  {
    path: 'saas/invitacion',
    renderMode: RenderMode.Server,
  },
  {
    path: 'saas/**',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];

/**
 * Rutas de servidor de la SUPERFICIE UNIFICADA (legacy en `/` + SaaS en
 * `/saas`, misma API).
 *
 * Se parte de las rutas legacy sin su comodín final para poder intercalar la
 * rama SaaS antes del comodín único. El ORDEN importa: Angular resuelve por la
 * primera coincidencia.
 *
 * - El comodín final queda en `Prerender` (igual que en el modo legacy) para
 *   que la landing pública `/` siga generándose estáticamente. Es seguro
 *   porque TODA ruta autenticada legacy ya se declaró antes como `Server`, y
 *   todo el panel SaaS (`saas/**`) se declara antes como `Client`: ninguna
 *   pantalla con sesión puede acabar prerenderizada.
 * - `saas/**` en `Client` mantiene el comportamiento ya probado del panel:
 *   sus guards leen el JWT de `sessionStorage` y la matriz de permisos, que no
 *   existen en el servidor.
 */
export const rutasServidorUnificado: ServerRoute[] = [
  ...rutasServidorLegacy.filter((ruta) => ruta.path !== '**'),
  {
    path: 'saas/login',
    renderMode: RenderMode.Server,
  },
  {
    path: 'saas/invitacion',
    renderMode: RenderMode.Server,
  },
  {
    path: 'saas/**',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];

/**
 * Modo de render por ruta.
 *
 * Las rutas legacy no existen en el bundle SaaS puro (y viceversa), y Angular
 * exige que cada `ServerRoute` corresponda a una ruta registrada: por eso se
 * elige el conjunto completo según el modo compilado. La superficie unificada
 * registra ambas tablas, así que necesita los dos conjuntos.
 */
export const serverRoutes: ServerRoute[] = !environment.saasMode
  ? rutasServidorLegacy
  : environment.saasLegacySurface
    ? rutasServidorUnificado
    : rutasServidorSaas;
