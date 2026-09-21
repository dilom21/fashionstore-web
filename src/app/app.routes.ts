import { Routes } from '@angular/router';

import { clienteAuthGuard } from './core/guards/cliente-auth.guard';
import { personalAuthGuard } from './core/guards/personal-auth.guard';

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
  {
    path: '',
    pathMatch: 'full',
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
