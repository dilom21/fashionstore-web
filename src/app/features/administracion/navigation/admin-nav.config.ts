import { AdminNavItem } from '../models/admin-nav-item';

/**
 * Configuración real de navegación del área administrativa.
 *
 * Los módulos reflejan los módulos de negocio existentes en la base
 * (SEGURIDAD, CATALOGO, INVENTARIO, RESERVAS, VENTAS,
 * COMPRAS_PROVEEDORES, REPORTES).
 *
 * "Seguridad > Gestionar Usuarios" (CU03), "Seguridad > Gestionar Roles y
 * Permisos" (CU04), "Seguridad > Consultar Bitácora" (CU05) e
 * "Inventario > Gestionar sucursales y ciudades" (CU06) están funcionales.
 * El resto de opciones tienen navegación preparada hacia una pantalla de
 * módulo en construcción.
 */
export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    id: 'inicio',
    label: 'Inicio',
    icon: 'inicio',
    route: '/admin/inicio',
    descripcion: 'Resumen y accesos del panel administrativo.',
    permiso: 'INICIO',
  },
  {
    id: 'seguridad',
    label: 'Seguridad',
    icon: 'seguridad',
    permiso: 'SEGURIDAD',
    descripcion: 'Usuarios, roles, permisos y bitácora.',
    children: [
      {
        id: 'usuarios',
        label: 'Gestionar Usuarios',
        icon: 'usuarios',
        route: '/admin/usuarios',
        descripcion:
          'Registra, consulta, edita, habilita y deshabilita cuentas del personal.',
        estado: 'funcional',
        permiso: 'SEGURIDAD:USUARIOS',
      },
      {
        id: 'roles-permisos',
        label: 'Gestionar Roles y Permisos',
        icon: 'roles',
        route: '/admin/seguridad/roles-permisos',
        descripcion: 'Administración de roles, funciones y permisos.',
        estado: 'funcional',
        permiso: 'SEGURIDAD:ROLES_PERMISOS',
      },
      {
        id: 'bitacora',
        label: 'Consultar Bitácora',
        icon: 'bitacora',
        route: '/admin/seguridad/bitacora',
        descripcion: 'Consulta de eventos y operaciones registradas.',
        estado: 'funcional',
        permiso: 'SEGURIDAD:BITACORA',
      },
    ],
  },
  {
    id: 'catalogo',
    label: 'Catálogo',
    icon: 'catalogo',
    route: '/admin/catalogo',
    descripcion: 'Productos, categorías, tallas, colores y colecciones.',
    estado: 'proximamente',
    permiso: 'CATALOGO',
  },
  {
    id: 'inventario',
    label: 'Inventario',
    icon: 'inventario',
    permiso: 'INVENTARIO',
    descripcion: 'Estructura física, existencias y movimientos de inventario.',
    children: [
      {
        id: 'sucursales-ciudades',
        label: 'Gestionar sucursales y ciudades',
        icon: 'sucursales',
        route: '/admin/inventario/sucursales-ciudades',
        descripcion:
          'Registra, consulta, edita, habilita y deshabilita sucursales y ciudades.',
        estado: 'funcional',
        permiso: 'INVENTARIO:SUCURSALES_CIUDADES',
      },
    ],
  },
  {
    id: 'reservas',
    label: 'Reservas',
    icon: 'reservas',
    route: '/admin/reservas',
    descripcion: 'Reservas de prendas para probar en sucursal.',
    estado: 'proximamente',
    permiso: 'RESERVAS',
  },
  {
    id: 'ventas',
    label: 'Ventas y Pagos',
    icon: 'ventas',
    route: '/admin/ventas',
    descripcion: 'Ventas presenciales, pagos y devoluciones.',
    estado: 'proximamente',
    permiso: 'VENTAS',
  },
  {
    id: 'compras',
    label: 'Compras y Proveedores',
    icon: 'compras',
    route: '/admin/compras',
    descripcion: 'Órdenes de compra y gestión de proveedores.',
    estado: 'proximamente',
    permiso: 'COMPRAS_PROVEEDORES',
  },
  {
    id: 'reportes',
    label: 'Reportes',
    icon: 'reportes',
    route: '/admin/reportes',
    descripcion: 'Reportes e indicadores del negocio.',
    estado: 'proximamente',
    permiso: 'REPORTES',
  },
];

/**
 * Devuelve solo las opciones habilitadas (preparación para CU04).
 *
 * Cuando exista autorización por módulo/función/acción se podrá llamar:
 *
 *   items.filter(item => usuarioTienePermiso(item.permiso))
 *
 * Esta función ofrece el mecanismo: conserva grupos sólo si conservan
 * al menos un hijo visible.
 */
export function filtrarItemsNav(
  items: readonly AdminNavItem[],
  puedeVer: (item: AdminNavItem) => boolean,
): AdminNavItem[] {
  const resultado: AdminNavItem[] = [];

  for (const item of items) {
    if (item.enabled === false) {
      continue;
    }

    if (item.children && item.children.length > 0) {
      const hijos = filtrarItemsNav(item.children, puedeVer);
      if (hijos.length === 0) {
        continue;
      }
      resultado.push({ ...item, children: hijos });
      continue;
    }

    if (puedeVer(item)) {
      resultado.push({ ...item });
    }
  }

  return resultado;
}

/** Aplana la navegación en destinos con ruta (útiles para accesos rápidos). */
export function aplanarDestinos(
  items: readonly AdminNavItem[],
): AdminNavItem[] {
  const destinos: AdminNavItem[] = [];
  for (const item of items) {
    if (item.children && item.children.length > 0) {
      destinos.push(...aplanarDestinos(item.children));
    } else if (item.route) {
      destinos.push(item);
    }
  }
  return destinos;
}
