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
    descripcion: 'Productos, categorías, tallas, colores y colecciones.',
    permiso: 'CATALOGO',
    children: [
      {
        id: 'catalogo-productos',
        label: 'Gestionar catálogo de productos',
        icon: 'productos',
        route: '/admin/catalogo/productos',
        descripcion:
          'Registra, consulta, edita, habilita y deshabilita productos, categorías, tallas, colores, variantes y recursos.',
        estado: 'funcional',
        permiso: 'CATALOGO:PRODUCTOS',
      },
      {
        id: 'temporadas-colecciones',
        label: 'Gestionar temporadas y colecciones',
        icon: 'colecciones',
        route: '/admin/catalogo/temporadas-colecciones',
        descripcion:
          'Registra, consulta, edita, habilita y deshabilita temporadas y colecciones, y asigna productos a cada colección.',
        estado: 'funcional',
      },
      {
        id: 'promociones',
        label: 'Gestionar promociones',
        icon: 'promociones',
        route: '/admin/catalogo/promociones',
        descripcion:
          'Registra, consulta, edita, habilita y deshabilita promociones, y asocia sus productos.',
        estado: 'funcional',
      },
    ],
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
    permiso: 'COMPRAS_PROVEEDORES',
    descripcion: 'Órdenes de compra y gestión de proveedores.',
    children: [
      {
        id: 'proveedores',
        label: 'Gestionar proveedores',
        icon: 'proveedores',
        route: '/admin/compras-proveedores/proveedores',
        descripcion:
          'Registra, consulta, edita, habilita y deshabilita proveedores y sus productos asociados.',
        estado: 'funcional',
        permiso: 'GESTIONAR_PROVEEDORES',
      },
      {
        id: 'ordenes-compra',
        label: 'Gestionar compras a proveedores',
        icon: 'compras',
        route: '/admin/compras-proveedores/ordenes-compra',
        descripcion:
          'Registra, consulta, edita y da seguimiento a las órdenes de compra: envía, cancela y recibe mercadería.',
        estado: 'funcional',
        permiso: 'GESTIONAR_ORDENES_COMPRA',
      },
    ],
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
