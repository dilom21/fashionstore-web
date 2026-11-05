import { Routes } from '@angular/router';

import { requierePermiso } from './guards/saas-permiso.guard';
import { saasClienteGuard } from './guards/saas-cliente.guard';
import { saasTenantGuard } from './guards/saas-tenant.guard';

/**
 * Rutas del modo SaaS (multiempresa).
 *
 * Se registran bajo `saas` desde `app.routes.ts` y SOLO cuando
 * `environment.saasMode` es true; en modo legacy no existen.
 *
 * - Públicas: `login`, `invitacion`, `sin-permiso`, `no-disponible`.
 * - Privadas: shell `''` protegido por `saasTenantGuard` (y `canActivateChild`,
 *   para que la protección se reevalúe al navegar entre hijos).
 *
 * `empresa`, `sucursales`, `personal`, `roles-permisos`, `catalogo`,
 * `ventas-contado`, `reservas`, `compras`, `devoluciones`, `inventario` y
 * `proveedores` ya consumen endpoints tenant reales. Los módulos del negocio
 * sin endpoint tenant siguen deshabilitados en la navegación (no navegan): no
 * se finge información.
 */


export const saasRoutes: Routes = [
  {
    path: 'tienda/:empresaSlug',
    title: 'Tienda · SaaS',
    loadComponent: () =>
      import('./pages/storefront/saas-storefront.page').then(
        (m) => m.SaasStorefrontPage,
      ),
  },
  {
    path: 'login',
    title: 'Iniciar sesión · SaaS',
    loadComponent: () =>
      import('./pages/login/saas-login.page').then((m) => m.SaasLoginPage),
  },
  {
    path: 'invitacion',
    title: 'Aceptar invitación · SaaS',
    loadComponent: () =>
      import('./pages/invitacion/saas-invitacion.page').then(
        (m) => m.SaasInvitacionPage,
      ),
  },
  {
    path: 'sin-permiso',
    title: 'Sin permiso · SaaS',
    loadComponent: () =>
      import('./pages/sin-permiso/saas-sin-permiso.page').then(
        (m) => m.SaasSinPermisoPage,
      ),
  },
  {
    path: 'no-disponible',
    title: 'No disponible · SaaS',
    loadComponent: () =>
      import('./pages/no-disponible/saas-no-disponible.page').then(
        (m) => m.SaasNoDisponiblePage,
      ),
  },
  {
    path: '',
    title: 'Panel SaaS',
    canActivate: [saasTenantGuard],
    canActivateChild: [saasTenantGuard],
    loadComponent: () =>
      import('./layout/saas-shell').then((m) => m.SaasShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
      {
        path: 'inicio',
        title: 'Inicio · SaaS',
        loadComponent: () =>
          import('./pages/inicio/saas-inicio.page').then(
            (m) => m.SaasInicioPage,
          ),
      },
      {
        path: 'merchandising',
        title: 'Merchandising · SaaS',
        canActivate: [requierePermiso('CATALOGO', 'CONSULTAR')],
        loadComponent: () =>
          import('./pages/merchandising/saas-merchandising.page').then(
            (m) => m.SaasMerchandisingPage,
          ),
      },
      {
        path: 'reportes',
        title: 'Reportes · SaaS',
        canActivate: [requierePermiso('REPORTES', 'CONSULTAR')],
        loadComponent: () =>
          import('./pages/reportes/saas-reportes.page').then(
            (m) => m.SaasReportesPage,
          ),
      },
      {
        path: 'cliente',
        title: 'Mi compra · SaaS',
        canActivate: [saasClienteGuard],
        loadComponent: () =>
          import('./pages/cliente/saas-cliente.page').then(
            (m) => m.SaasClientePage,
          ),
      },
      {
        path: 'cliente/pagos/:venta_id',
        title: 'Pago electrónico · SaaS',
        canActivate: [saasClienteGuard],
        loadComponent: () =>
          import('./pages/cliente-pago/saas-cliente-pago.page').then(
            (m) => m.SaasClientePagoPage,
          ),
      },
      {
        // Cualquier miembro puede consultar los datos de su propia empresa.
        path: 'empresa',
        title: 'Mi empresa · SaaS',
        loadComponent: () =>
          import('./pages/empresa/saas-empresa.page').then(
            (m) => m.SaasEmpresaPage,
          ),
      },
      {
        path: 'sucursales',
        title: 'Sucursales · SaaS',
        canActivate: [requierePermiso('SUCURSALES', 'CONSULTAR')],
        loadComponent: () =>
          import('./pages/sucursales/saas-sucursales.page').then(
            (m) => m.SaasSucursalesPage,
          ),
      },
      {
        path: 'personal',
        title: 'Personal · SaaS',
        canActivate: [requierePermiso('PERSONAL', 'CONSULTAR')],
        loadComponent: () =>
          import('./pages/personal/saas-personal.page').then(
            (m) => m.SaasPersonalPage,
          ),
      },
      {
        // La edición de la matriz exige PERSONAL/ADMINISTRAR; la pantalla lo
        // vuelve a comprobar antes de habilitar la escritura.
        path: 'roles-permisos',
        title: 'Roles y permisos · SaaS',
        canActivate: [requierePermiso('PERSONAL', 'CONSULTAR')],
        loadComponent: () =>
          import('./pages/roles-permisos/saas-roles-permisos.page').then(
            (m) => m.SaasRolesPermisosPage,
          ),
      },
      {
        // Catálogo real: lectura para todo miembro, escritura solo ADMINISTRADOR.
        path: 'catalogo',
        title: 'Catálogo · SaaS',
        canActivate: [requierePermiso('CATALOGO', 'CONSULTAR')],
        loadComponent: () =>
          import('./pages/catalogo/saas-catalogo.page').then(
            (m) => m.SaasCatalogoPage,
          ),
      },
      {
        // Inventario de solo lectura: el contrato solo expone GET.
        path: 'inventario',
        title: 'Inventario · SaaS',
        canActivate: [requierePermiso('VENTAS', 'CONSULTAR')],
        loadComponent: () =>
          import('./pages/inventario/saas-inventario.page').then(
            (m) => m.SaasInventarioPage,
          ),
      },
      {
        // La ruta exige VENTAS/REGISTRAR; la pantalla vuelve a comprobarlo.
        path: 'ventas-contado',
        title: 'Venta de contado · SaaS',
        canActivate: [requierePermiso('VENTAS', 'REGISTRAR')],
        loadComponent: () =>
          import('./pages/ventas-contado/saas-ventas-contado.page').then(
            (m) => m.SaasVentasContadoPage,
          ),
      },
      {
        // Las acciones de reserva validan el rol en el backend; la ruta solo
        // exige el permiso de consulta del módulo.
        path: 'reservas',
        title: 'Reservas · SaaS',
        canActivate: [requierePermiso('RESERVAS', 'CONSULTAR')],
        loadComponent: () =>
          import('./pages/reservas/saas-reservas.page').then(
            (m) => m.SaasReservasPage,
          ),
      },
      {
        path: 'compras',
        title: 'Compras · SaaS',
        canActivate: [requierePermiso('COMPRAS', 'CONSULTAR')],
        loadComponent: () =>
          import('./pages/compras/saas-compras.page').then(
            (m) => m.SaasComprasPage,
          ),
      },
      {
        // El alta y la asociación de productos exigen COMPRAS/GESTIONAR; la
        // pantalla vuelve a comprobarlo antes de habilitar la escritura.
        path: 'proveedores',
        title: 'Proveedores · SaaS',
        canActivate: [requierePermiso('COMPRAS', 'GESTIONAR')],
        loadComponent: () =>
          import('./pages/proveedores/saas-proveedores.page').then(
            (m) => m.SaasProveedoresPage,
          ),
      },
      {
        path: 'devoluciones',
        title: 'Devoluciones · SaaS',
        canActivate: [requierePermiso('DEVOLUCIONES', 'CONSULTAR')],
        loadComponent: () =>
          import('./pages/devoluciones/saas-devoluciones.page').then(
            (m) => m.SaasDevolucionesPage,
          ),
      },
    ],
  },
];
