import { IconoAdmin } from '../../features/administracion/models/admin-nav-item';

/**
 * Navegación del shell SaaS.
 *
 * Agrupación funcional (Operación / Empresa / Catálogo / Comercial) más un
 * grupo informativo con los módulos P1 que todavía NO tienen endpoint tenant.
 *
 * `permiso` es una ayuda de visibilidad: el shell pasa cada item por
 * `SaasPermissionsService.puede(funcion, accion)` usando el catálogo real de
 * `GET /tenant/empresa/permisos` (PERSONAL, SUCURSALES, CATALOGO, COMPRAS,
 * DEVOLUCIONES, RESERVAS, VENTAS y REPORTES). `permisoEdicion` marca las
 * pantallas con escritura para avisar cuando el rol solo puede consultar.
 */
export interface SaasPermisoNav {
  funcion: string;
  accion: string;
}

/** Item de navegación del shell SaaS. */
export interface SaasNavItem {
  id: string;
  label: string;
  icon: IconoAdmin;
  /** Ruta SPA destino (ausente en módulos aún no enrutados). */
  route?: string;
  /** Permiso función/acción que controla su visibilidad. */
  permiso?: SaasPermisoNav;
  /** Permiso que habilita la escritura dentro de la pantalla. */
  permisoEdicion?: SaasPermisoNav;
  /** `false` → se muestra deshabilitado con badge "Próx." y no navega. */
  disponible: boolean;
  descripcion?: string;
  /** Session contexts where the entry is applicable. */
  contextos?: readonly ('personal' | 'cliente')[];
}

/** Grupo de navegación. */
export interface SaasNavGrupo {
  id: string;
  label: string;
  items: SaasNavItem[];
  contextos?: readonly ('personal' | 'cliente')[];
}

/** Accesos directos del inicio (mismas rutas que la navegación). */
export const SAAS_NAV_GRUPOS: SaasNavGrupo[] = [
  {
    id: 'operacion',
    label: 'Operación',
    items: [
      {
        id: 'inicio',
        label: 'Inicio',
        icon: 'inicio',
        route: '/saas/inicio',
        disponible: true,
        descripcion: 'Resumen de la empresa y accesos directos.',
        contextos: ['personal'],
      },
      {
        id: 'cliente',
        label: 'Mis compras',
        icon: 'ventas',
        route: '/saas/cliente',
        disponible: true,
        descripcion: 'Carritos, reservas, pagos y comprobantes.',
        contextos: ['cliente'],
      },
    ],
  },
  {
    id: 'empresa',
    label: 'Empresa',
    contextos: ['personal'],
    items: [
      {
        id: 'empresa',
        label: 'Mi empresa',
        icon: 'estado',
        route: '/saas/empresa',
        disponible: true,
        descripcion: 'Datos de la empresa y de la suscripción vigente.',
      },
      {
        id: 'sucursales',
        label: 'Sucursales',
        icon: 'sucursales',
        route: '/saas/sucursales',
        permiso: { funcion: 'SUCURSALES', accion: 'CONSULTAR' },
        disponible: true,
        descripcion: 'Sucursales activas y límite del plan.',
      },
      {
        id: 'personal',
        label: 'Personal',
        icon: 'usuarios',
        route: '/saas/personal',
        permiso: { funcion: 'PERSONAL', accion: 'CONSULTAR' },
        permisoEdicion: { funcion: 'PERSONAL', accion: 'ADMINISTRAR' },
        disponible: true,
        descripcion: 'Usuarios y membresías de la empresa.',
      },
      {
        id: 'roles-permisos',
        label: 'Roles y permisos',
        icon: 'roles',
        route: '/saas/roles-permisos',
        permiso: { funcion: 'PERSONAL', accion: 'CONSULTAR' },
        permisoEdicion: { funcion: 'PERSONAL', accion: 'ADMINISTRAR' },
        disponible: true,
        descripcion: 'Roles de la empresa y su matriz de permisos.',
      },
    ],
  },
  {
    id: 'catalogo',
    label: 'Catálogo',
    contextos: ['personal'],
    items: [
      {
        id: 'catalogo',
        label: 'Catálogo',
        icon: 'catalogo',
        route: '/saas/catalogo',
        permiso: { funcion: 'CATALOGO', accion: 'CONSULTAR' },
        disponible: true,
        descripcion: 'Productos, variantes y precios de la empresa.',
      },
      {
        id: 'inventario',
        label: 'Inventario',
        icon: 'inventario',
        route: '/saas/inventario',
        permiso: { funcion: 'VENTAS', accion: 'CONSULTAR' },
        disponible: true,
        descripcion: 'Existencias por sucursal, producto y variante.',
      },
      {
        id: 'merchandising',
        label: 'Merchandising',
        icon: 'colecciones',
        route: '/saas/merchandising',
        permiso: { funcion: 'CATALOGO', accion: 'CONSULTAR' },
        permisoEdicion: { funcion: 'CATALOGO', accion: 'ADMINISTRAR' },
        disponible: true,
        descripcion: 'Temporadas, colecciones y promociones de la empresa.',
      },
    ],
  },
  {
    id: 'comercial',
    label: 'Comercial',
    contextos: ['personal'],
    items: [
      {
        id: 'ventas-contado',
        label: 'Venta de contado',
        icon: 'ventas',
        route: '/saas/ventas-contado',
        permiso: { funcion: 'VENTAS', accion: 'REGISTRAR' },
        disponible: true,
        descripcion: 'Registro de ventas cobradas en el momento.',
      },
      {
        id: 'reservas',
        label: 'Reservas',
        icon: 'reservas',
        route: '/saas/reservas',
        permiso: { funcion: 'RESERVAS', accion: 'CONSULTAR' },
        disponible: true,
        descripcion: 'Reservas de prendas y su atención.',
      },
      {
        id: 'compras',
        label: 'Compras',
        icon: 'compras',
        route: '/saas/compras',
        permiso: { funcion: 'COMPRAS', accion: 'CONSULTAR' },
        disponible: true,
        descripcion: 'Órdenes de compra a proveedores.',
      },
      {
        // El alta y la asociación de productos exigen COMPRAS/GESTIONAR; el
        // listado del catálogo solo exige COMPRAS/CONSULTAR.
        id: 'proveedores',
        label: 'Proveedores',
        icon: 'proveedores',
        route: '/saas/proveedores',
        permiso: { funcion: 'COMPRAS', accion: 'GESTIONAR' },
        disponible: true,
        descripcion: 'Alta de proveedores y productos que abastecen.',
      },
      {
        id: 'devoluciones',
        label: 'Devoluciones',
        icon: 'actualizar',
        route: '/saas/devoluciones',
        permiso: { funcion: 'DEVOLUCIONES', accion: 'CONSULTAR' },
        disponible: true,
        descripcion: 'Devoluciones y su procesamiento.',
      },
    ],
  },
  {
    // Módulos P1: existen en el negocio, pero el backend SaaS todavía no
    // expone su endpoint tenant. Se muestran deshabilitados, sin fingir datos.
    id: 'no-disponible',
    label: 'No disponible en esta versión',
    contextos: ['personal'],
    items: [
      {
        id: 'movimientos-inventario',
        label: 'Movimientos de inventario',
        icon: 'bitacora',
        route: '/saas/movimientos-inventario',
        disponible: false,
        descripcion: 'Kardex de entradas y salidas.',
      },
      {
        id: 'promociones',
        label: 'Promociones',
        icon: 'promociones',
        route: '/saas/promociones',
        disponible: false,
        descripcion: 'Descuentos y campañas.',
      },
      {
        id: 'temporadas',
        label: 'Temporadas',
        icon: 'calendario',
        route: '/saas/temporadas',
        disponible: false,
        descripcion: 'Temporadas comerciales.',
      },
      {
        id: 'colecciones',
        label: 'Colecciones',
        icon: 'colecciones',
        route: '/saas/colecciones',
        disponible: false,
        descripcion: 'Colecciones de productos.',
      },
      {
        id: 'tallas',
        label: 'Tallas',
        icon: 'lista',
        route: '/saas/tallas',
        disponible: false,
        descripcion: 'Catálogo de tallas.',
      },
      {
        id: 'colores',
        label: 'Colores',
        icon: 'tool',
        route: '/saas/colores',
        disponible: false,
        descripcion: 'Catálogo de colores.',
      },
      {
        id: 'ciudades',
        label: 'Ciudades',
        icon: 'ubicacion',
        route: '/saas/ciudades',
        disponible: false,
        descripcion: 'Ciudades de cobertura.',
      },
      {
        id: 'pagos',
        label: 'Pagos',
        icon: 'numero',
        route: '/saas/pagos',
        disponible: false,
        descripcion: 'Pagos y conciliación.',
      },
      {
        id: 'reportes',
        label: 'Reportes',
        icon: 'reportes',
        route: '/saas/reportes',
        permiso: { funcion: 'REPORTES', accion: 'CONSULTAR' },
        disponible: true,
        descripcion: 'Reportes convencionales y de IA.',
      },
      {
        id: 'bitacora',
        label: 'Bitácora',
        icon: 'bitacora',
        route: '/saas/bitacora',
        disponible: false,
        descripcion: 'Eventos y auditoría.',
      },
      {
        id: 'asistencia-inteligente',
        label: 'Asistencia inteligente',
        icon: 'comentario',
        route: '/saas/asistencia-inteligente',
        disponible: false,
        descripcion: 'Asistencia con IA.',
      },
      {
        id: 'vestidor-virtual',
        label: 'Vestidor virtual',
        icon: 'usuario',
        route: '/saas/vestidor-virtual',
        disponible: false,
        descripcion: 'Prueba virtual de prendas.',
      },
      {
        id: 'ventas-digital',
        label: 'Ventas digitales',
        icon: 'ventas',
        route: '/saas/ventas-digital',
        disponible: false,
        descripcion: 'Ventas del canal digital.',
      },
      {
        id: 'comprobantes',
        label: 'Comprobantes',
        icon: 'lista',
        route: '/saas/comprobantes',
        disponible: false,
        descripcion: 'Emisión y consulta de comprobantes.',
      },
    ],
  },
];

/**
 * Filtra la navegación según permisos.
 *
 * - Item sin `permiso` → visible.
 * - Item con `permiso` → visible solo si `puede(item)`.
 * - Los grupos que se quedan sin items se descartan.
 *
 * Los módulos P1 (`disponible: false`) se conservan siempre: son informativos
 * y no navegan.
 */
export function filtrarNavSaas(
  grupos: readonly SaasNavGrupo[],
  puede: (item: SaasNavItem) => boolean,
  contexto?: 'personal' | 'cliente' | null,
): SaasNavGrupo[] {
  const resultado: SaasNavGrupo[] = [];

  for (const grupo of grupos) {
    if (
      grupo.contextos !== undefined &&
      contexto != null &&
      !grupo.contextos.includes(contexto)
    ) {
      continue;
    }
    const items = grupo.items.filter(
      (item) =>
        (item.contextos === undefined ||
          contexto == null ||
          item.contextos.includes(contexto)) &&
        (!item.disponible || item.permiso === undefined || puede(item)),
    );
    if (items.length > 0) {
      resultado.push({ ...grupo, items });
    }
  }

  return resultado;
}
