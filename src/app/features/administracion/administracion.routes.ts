import { Routes } from '@angular/router';

import { adminAuthGuard } from '../../core/guards/admin-auth.guard';
import { AdministracionShell } from './administracion-shell/administracion-shell';

/**
 * Rutas del área administrativa (/admin).
 *
 * Se montan bajo el prefijo 'admin' en app.routes.ts y exigen rol
 * ADMINISTRADOR (adminAuthGuard en el shell padre).
 *
 * CU03 - Gestión de Usuarios, CU04 - Gestión de Roles y Permisos, CU05 -
 * Consultar Bitácora y CU06 - Gestionar Sucursales y Ciudades son las
 * funcionalidades activas. El resto de módulos tiene rutas preparadas hacia
 * la pantalla de "módulo en construcción" para que la navegación exista sin
 * inventar funcionalidad.
 */
export const administracionRoutes: Routes = [
  {
    path: '',
    component: AdministracionShell,
    canActivate: [adminAuthGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
      {
        path: 'inicio',
        loadComponent: () =>
          import('./inicio/pages/admin-inicio-page/admin-inicio-page').then(
            (m) => m.AdminInicioPage,
          ),
      },
      // ===== CU03 - Gestionar Usuarios (funcional) =====
      {
        path: 'usuarios',
        loadComponent: () =>
          import('./usuarios/pages/usuarios-page/usuarios-page').then(
            (m) => m.UsuariosPage,
          ),
      },
      {
        path: 'usuarios/nuevo',
        loadComponent: () =>
          import('./usuarios/pages/usuario-form-page/usuario-form-page').then(
            (m) => m.UsuarioFormPage,
          ),
      },
      {
        path: 'usuarios/:id',
        loadComponent: () =>
          import(
            './usuarios/pages/usuario-detalle-page/usuario-detalle-page'
          ).then((m) => m.UsuarioDetallePage),
      },
      {
        path: 'usuarios/:id/editar',
        loadComponent: () =>
          import('./usuarios/pages/usuario-form-page/usuario-form-page').then(
            (m) => m.UsuarioFormPage,
          ),
      },
      // ===== CU04 - Gestionar Roles y Permisos (funcional) =====
      {
        path: 'seguridad/roles-permisos',
        loadComponent: () =>
          import(
            './roles-permisos/pages/roles-permisos-page/roles-permisos-page'
          ).then((m) => m.RolesPermisosPage),
      },
      // ===== CU05 - Consultar Bitácora (funcional) =====
      {
        path: 'seguridad/bitacora',
        loadComponent: () =>
          import('./bitacora/pages/bitacora-page/bitacora-page').then(
            (m) => m.BitacoraPage,
          ),
      },
      // ===== CU06 - Gestionar Sucursales y Ciudades (funcional) =====
      {
        path: 'inventario/sucursales-ciudades',
        loadComponent: () =>
          import(
            './inventario/pages/sucursales-ciudades-page/sucursales-ciudades-page'
          ).then((m) => m.SucursalesCiudadesPage),
      },
      // ===== Módulos de negocio (rutas preparadas) =====
      {
        path: 'catalogo',
        data: {
          modulo: 'CATALOGO',
          titulo: 'Catálogo',
          descripcion:
            'Productos, categorías, tallas, colores y colecciones de la marca.',
          icono: 'catalogo',
        },
        loadComponent: () =>
          import(
            './components/modulo-en-construccion/modulo-en-construccion'
          ).then((m) => m.ModuloEnConstruccion),
      },
      {
        path: 'reservas',
        data: {
          modulo: 'RESERVAS',
          titulo: 'Reservas',
          descripcion:
            'Reservas de prendas para probar en sucursal.',
          icono: 'reservas',
        },
        loadComponent: () =>
          import(
            './components/modulo-en-construccion/modulo-en-construccion'
          ).then((m) => m.ModuloEnConstruccion),
      },
      {
        path: 'ventas',
        data: {
          modulo: 'VENTAS',
          titulo: 'Ventas y Pagos',
          descripcion:
            'Ventas presenciales, gestión de pagos y devoluciones.',
          icono: 'ventas',
        },
        loadComponent: () =>
          import(
            './components/modulo-en-construccion/modulo-en-construccion'
          ).then((m) => m.ModuloEnConstruccion),
      },
      {
        path: 'compras',
        data: {
          modulo: 'COMPRAS_PROVEEDORES',
          titulo: 'Compras y Proveedores',
          descripcion:
            'Órdenes de compra y gestión de proveedores.',
          icono: 'compras',
        },
        loadComponent: () =>
          import(
            './components/modulo-en-construccion/modulo-en-construccion'
          ).then((m) => m.ModuloEnConstruccion),
      },
      {
        path: 'reportes',
        data: {
          modulo: 'REPORTES',
          titulo: 'Reportes',
          descripcion:
            'Reportes e indicadores del negocio.',
          icono: 'reportes',
        },
        loadComponent: () =>
          import(
            './components/modulo-en-construccion/modulo-en-construccion'
          ).then((m) => m.ModuloEnConstruccion),
      },
    ],
  },
];
