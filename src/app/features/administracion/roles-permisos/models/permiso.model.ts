/**
 * Modelos del catálogo de permisos y de la matriz por rol (CU04).
 *
 * Coinciden con el JSON real de:
 *  - GET /roles/catalogo-permisos
 *  - GET /roles/{rol_id}/permisos
 *  - PUT /roles/{rol_id}/permisos
 *
 * La jerarquía es Modulo -> Funcion -> Acciones. Los ids siempre provienen
 * del backend; nunca se hardcodean en la interfaz.
 */

/** Acción dentro del catálogo (sin estado otorgado). */
export interface Accion {
  id: number;
  nombre: string;
  descripcion: string | null;
}

/** Función dentro del catálogo, con sus acciones. */
export interface FuncionPermisos {
  id: number;
  nombre: string;
  descripcion: string | null;
  acciones: Accion[];
}

/** Módulo del catálogo, con sus funciones. */
export interface ModuloPermisos {
  id: number;
  nombre: string;
  descripcion: string | null;
  funciones: FuncionPermisos[];
}

/** Acción con su estado otorgado para el rol consultado. */
export interface AccionAsignada extends Accion {
  otorgada: boolean;
}

/** Función con acciones otorgadas/no otorgadas del rol. */
export interface FuncionAsignada {
  id: number;
  nombre: string;
  descripcion: string | null;
  acciones: AccionAsignada[];
}

/** Módulo con funciones otorgadas/no otorgadas del rol. */
export interface ModuloAsignado {
  id: number;
  nombre: string;
  descripcion: string | null;
  funciones: FuncionAsignada[];
}

/** Respuesta de GET /roles/{rol_id}/permisos. */
export interface RolPermisos {
  rol_id: number;
  rol_nombre: string;
  modulos: ModuloAsignado[];
}

/** Par funcion_id + accion_id de la matriz (un permiso otorgado). */
export interface PermisoSeleccionado {
  funcion_id: number;
  accion_id: number;
}

/** Cuerpo de PUT /roles/{rol_id}/permisos (reemplazo atómico). */
export interface RolPermisosUpdate {
  permisos: PermisoSeleccionado[];
}
