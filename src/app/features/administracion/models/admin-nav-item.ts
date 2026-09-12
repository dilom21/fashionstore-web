/**
 * Modelo de navegación del área administrativa (/admin).
 *
 * La navegación es responsabilidad del frontend (rutas de la SPA). No se lee
 * ninguna tabla de módulos: esto queda definido aquí en TypeScript. Más
 * adelante (CU04) se podrá filtrar esta estructura por rol/permisos sin
 * tocar el HTML.
 */

/** Iconos de módulos y de UI usados por la barra lateral. */
export type IconoNav =
  | 'inicio'
  | 'seguridad'
  | 'usuarios'
  | 'roles'
  | 'bitacora'
  | 'catalogo'
  | 'productos'
  | 'colecciones'
  | 'inventario'
  | 'sucursales'
  | 'reservas'
  | 'ventas'
  | 'compras'
  | 'reportes';

/** Iconos auxiliares de interfaz. */
export type IconoUi =
  | 'chevron'
  | 'chevron-left'
  | 'chevron-right'
  | 'logout'
  | 'menu'
  | 'close'
  | 'tool'
  | 'arrow-right';

export type IconoAdmin = IconoNav | IconoUi;

/** Estado de disponibilidad visible de una opción. */
export type EstadoNav = 'funcional' | 'proximamente';

/**
 * Elemento de navegación administrativa.
 *
 * - `route`: ruta concreta. Las opciones sin ruta son contenedores
 *   expandibles (grupo con `children`).
 * - `enabled`: interruptor para ocultar/mostrar opciones (preparación CU04).
 * - `permiso`: clave de módulo/permiso que CU04 podrá usar al filtrar.
 */
export interface AdminNavItem {
  id: string;
  label: string;
  icon: IconoAdmin;
  route?: string;
  descripcion?: string;
  children?: AdminNavItem[];
  enabled?: boolean;
  estado?: EstadoNav;
  permiso?: string;
}
