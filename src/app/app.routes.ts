import { Routes } from '@angular/router';

import { clienteAuthGuard } from './core/guards/cliente-auth.guard';
import { personalAuthGuard } from './core/guards/personal-auth.guard';
import { personalSaasAuthGuard } from './core/guards/personal-saas-auth.guard';
import { tenantAdminAuthGuard } from './core/guards/tenant-admin-auth.guard';
import {
  offlineReservaGuard,
  offlineTenantAuthGuard,
  offlineVentaGuard,
} from './core/guards/offline-tenant.guard';

/**
 * Rutas públicas y de autenticación:
 *  - ''                   -> Home / Landing pública
 *  - catalogo             -> Catálogo público de productos (CU09)
 *  - catalogo/productos/:producto_id -> Detalle público de producto (CU09)
 *  - login                -> Login de CLIENTES
 *  - auth                 -> Rutas internas de autenticación-seguridad
 *                            (auth/personal/login -> Login del PERSONAL)
 *  - dashboard            -> Zona del personal (protegida)
 */
export const routes: Routes = [
  // SaaS multitenant: sesión/JWT empresarial independiente del login legacy.
  // La seguridad de permisos está en el backend; estas rutas no abren SaaS.
  {
    path: 'saas/ingresar',
    title: 'Portal empresarial · FashionStore',
    loadComponent: () =>
      import('./features/saas/pages/tenant-login.page').then(
        (m) => m.TenantLoginPage,
      ),
  },
  {
    // Panel empresarial (CU04/CU05): solo ADMINISTRADOR de la empresa. El rol
    // se toma de GET /auth/tenant/me, nunca del rol legacy ni del formulario.
    path: 'saas/empresa',
    title: 'Panel empresarial · FashionStore',
    canActivate: [tenantAdminAuthGuard],
    loadComponent: () =>
      import('./features/saas/pages/tenant-empresa.page').then(
        (m) => m.TenantEmpresaPage,
      ),
  },
  {
    // Pantalla neutral de sesión empresarial autenticada: da destino a
    // ENCARGADO_SUCURSAL y CAJERO mientras sus módulos no estén adaptados.
    path: 'saas/sesion',
    title: 'Sesión empresarial · FashionStore',
    canActivate: [personalSaasAuthGuard],
    loadComponent: () =>
      import('./features/saas/pages/tenant-sesion.page').then(
        (m) => m.TenantSesionPage,
      ),
  },
  // ===== PWA CU17-CU20: shell cacheable y datos exclusivamente locales =====
  {
    path: 'offline/preparar',
    title: 'Preparar datos offline · FashionStore',
    canActivate: [offlineTenantAuthGuard],
    loadComponent: () =>
      import('./features/saas/pages/offline-preparation.page').then(
        (m) => m.OfflinePreparationPage,
      ),
  },
  {
    path: 'offline/catalogo',
    title: 'Catálogo offline · FashionStore',
    canActivate: [offlineTenantAuthGuard],
    loadComponent: () =>
      import('./features/saas/pages/offline-catalogo.page').then(
        (m) => m.OfflineCatalogoPage,
      ),
  },
  {
    path: 'offline/catalogo/:id',
    title: 'Detalle offline · FashionStore',
    canActivate: [offlineTenantAuthGuard],
    loadComponent: () =>
      import('./features/saas/pages/offline-catalogo-detalle.page').then(
        (m) => m.OfflineCatalogoDetallePage,
      ),
  },
  {
    path: 'offline/reservas/nueva',
    title: 'Reserva offline · FashionStore',
    canActivate: [offlineReservaGuard],
    data: { tipo: 'RESERVA' },
    loadComponent: () =>
      import('./features/saas/pages/offline-operacion.page').then(
        (m) => m.OfflineOperacionPage,
      ),
  },
  {
    path: 'offline/ventas/nueva',
    title: 'Venta de contado offline · FashionStore',
    canActivate: [offlineVentaGuard],
    data: { tipo: 'VENTA_CONTADO' },
    loadComponent: () =>
      import('./features/saas/pages/offline-operacion.page').then(
        (m) => m.OfflineOperacionPage,
      ),
  },
  {
    path: 'offline/operaciones',
    title: 'Operaciones offline · FashionStore',
    canActivate: [offlineTenantAuthGuard],
    loadComponent: () =>
      import('./features/saas/pages/offline-operaciones.page').then(
        (m) => m.OfflineOperacionesPage,
      ),
  },
  // Alias compatibles con las rutas publicadas por Josias.
  { path: 'saas/offline', redirectTo: 'offline/preparar', pathMatch: 'full' },
  { path: 'saas/catalogo-offline', redirectTo: 'offline/catalogo', pathMatch: 'full' },
  { path: 'saas/catalogo-offline/:id', redirectTo: 'offline/catalogo/:id' },
  {
    path: 'saas/offline',
    title: 'Preparación offline · FashionStore',
    canActivate: [personalSaasAuthGuard],
    loadComponent: () =>
      import('./features/saas/pages/offline-preparation.page').then(
        (m) => m.OfflinePreparationPage,
      ),
  },
  {
    path: 'saas/catalogo-offline',
    title: 'Catálogo offline · FashionStore',
    canActivate: [personalSaasAuthGuard],
    loadComponent: () => import('./features/saas/pages/offline-catalogo.page').then((m) => m.OfflineCatalogoPage),
  },
  {
    path: 'saas/catalogo-offline/:id',
    title: 'Detalle offline · FashionStore',
    canActivate: [personalSaasAuthGuard],
    loadComponent: () => import('./features/saas/pages/offline-catalogo-detalle.page').then((m) => m.OfflineCatalogoDetallePage),
  },
  {
    path: '',
    pathMatch: 'full',
    title: 'FashionStore | Moda online y portal empresarial',
    loadComponent: () =>
      import('./features/home/pages/home/home').then((m) => m.Home),
  },
  // ===== CU09 - Consultar catálogo y disponibilidad (cliente) =====
  {
    path: 'catalogo',
    loadComponent: () =>
      import('./features/catalogo/pages/catalogo-page/catalogo-page').then(
        (m) => m.CatalogoPage,
      ),
  },
  {
    path: 'catalogo/productos/:producto_id',
    loadComponent: () =>
      import(
        './features/catalogo/pages/producto-detalle-page/producto-detalle-page'
      ).then((m) => m.ProductoDetallePage),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/autenticacion-seguridad/auth/pages/login/login').then(
        (m) => m.Login,
      ),
  },
  // ===== Registro público de clientes (POST /auth/clientes/registro) =====
  // Ruta de UI pública (`/registro`); NO es el endpoint de la API. No lleva
  // guard, se carga de forma diferida y se declara antes del wildcard.
  {
    path: 'registro',
    loadComponent: () =>
      import(
        './features/autenticacion-seguridad/auth/pages/registro-cliente/registro-cliente'
      ).then((m) => m.RegistroCliente),
  },
  // ===== CU15 - Carrito de compras (solo CLIENTE autenticado) =====
  {
    path: 'carritos',
    canActivate: [clienteAuthGuard],
    loadComponent: () =>
      import('./features/carrito/pages/carritos-page/carritos-page').then(
        (m) => m.CarritosPage,
      ),
  },
  {
    path: 'carritos/:carrito_id',
    canActivate: [clienteAuthGuard],
    loadComponent: () =>
      import(
        './features/carrito/pages/carrito-detalle-page/carrito-detalle-page'
      ).then((m) => m.CarritoDetallePage),
  },
  // ===== CU16 - Reservas de prendas (solo CLIENTE autenticado) =====
  // `reservas/nueva/:carrito_id` se declara ANTES de `reservas/:reserva_id`
  // para que "nueva" no se interprete como un reserva_id.
  {
    path: 'reservas',
    canActivate: [clienteAuthGuard],
    loadComponent: () =>
      import('./features/reservas/pages/reservas-page/reservas-page').then(
        (m) => m.ReservasPage,
      ),
  },
  {
    path: 'reservas/nueva/:carrito_id',
    canActivate: [clienteAuthGuard],
    loadComponent: () =>
      import(
        './features/reservas/pages/crear-reserva-page/crear-reserva-page'
      ).then((m) => m.CrearReservaPage),
  },
  {
    path: 'reservas/:reserva_id',
    canActivate: [clienteAuthGuard],
    loadComponent: () =>
      import(
        './features/reservas/pages/reserva-detalle-page/reserva-detalle-page'
      ).then((m) => m.ReservaDetallePage),
  },
  // ===== CU19 - Realizar compra digital (solo CLIENTE autenticado) =====
  // El checkout confirma la compra y crea la venta PENDIENTE (sin pago: CU22).
  {
    path: 'checkout/:carrito_id',
    canActivate: [clienteAuthGuard],
    loadComponent: () =>
      import(
        './features/ventas/pages/checkout-digital-page/checkout-digital-page'
      ).then((m) => m.CheckoutDigitalPage),
  },
  // ===== CU22 - Procesar pago electrónico con Stripe (solo CLIENTE) =====
  // Recibe el venta_id de la venta PENDIENTE creada por CU19. Permite recargar
  // y recrear/reutilizar el PaymentIntent. Stripe.js solo se inicializa en el
  // navegador (SSR-safe). Se declara antes del wildcard.
  {
    path: 'pagos/stripe/:venta_id',
    canActivate: [clienteAuthGuard],
    loadComponent: () =>
      import(
        './features/ventas/pages/pago-electronico-page/pago-electronico-page'
      ).then((m) => m.PagoElectronicoPage),
  },
  // ===== CU24 - Historial de compras (solo CLIENTE autenticado) =====
  // El backend identifica al cliente desde el JWT (`get_current_cliente`): el
  // frontend nunca envía `cliente_id`. Se declara antes del wildcard.
  {
    path: 'ventas/historial',
    canActivate: [clienteAuthGuard],
    loadComponent: () =>
      import(
        './features/ventas/pages/historial-compras-page/historial-compras-page'
      ).then((m) => m.HistorialComprasPage),
  },
  // ===== CU23 - Emitir comprobante de venta (solo CLIENTE dueño de la venta) =====
  // Se abre desde el resultado exitoso de CU22 (VER COMPROBANTE). El backend
  // responde 403 si la venta no es del cliente autenticado. Se declara antes
  // del wildcard.
  {
    path: 'ventas/:venta_id/comprobante',
    canActivate: [clienteAuthGuard],
    loadComponent: () =>
      import(
        './features/ventas/pages/comprobante-cliente-page/comprobante-cliente-page'
      ).then((m) => m.ComprobanteClientePage),
  },
  {
    path: 'auth',
    loadChildren: () =>
      import(
        './features/autenticacion-seguridad/autenticacion-seguridad.routes'
      ).then((m) => m.autenticacionSeguridadRoutes),
  },
  {
    path: 'dashboard',
    canActivate: [personalAuthGuard],
    loadComponent: () =>
      import(
        './features/autenticacion-seguridad/auth/pages/dashboard/dashboard'
      ).then((m) => m.Dashboard),
  },
  {
    path: 'admin',
    loadChildren: () =>
      import('./features/administracion/administracion.routes').then(
        (m) => m.administracionRoutes,
      ),
  },
  // ===== Área operativa del personal (shell principal) =====
  // CU18 - Atender reserva de prendas y CU20 - Registrar venta presencial
  // comparten el prefijo /personal y el mismo AdministracionShell. Cada ruta
  // conserva su propio guard semántico.
  {
    path: 'personal',
    loadChildren: async () => {
      const [atencion, ventas, devoluciones] = await Promise.all([
        import('./features/atencion-reservas/atencion-reservas.routes'),
        import('./features/ventas/ventas.routes'),
        import('./features/devoluciones/devoluciones.routes'),
      ]);
      return [
        ...atencion.atencionReservasRoutes,
        ...ventas.ventasRoutes,
        ...devoluciones.devolucionesRoutes,
      ];
    },
  },
  { path: '**', redirectTo: '' },
];
