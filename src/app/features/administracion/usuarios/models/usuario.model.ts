/**
 * Modelos de datos del dominio Gestión de Usuarios (CU03).
 *
 * Los nombres de propiedad coinciden exactamente con el JSON real que expone
 * el backend FastAPI (usuarios, roles, sucursales). No se convierten a
 * camelCase para mantener compatibilidad directa con la API.
 */

/** Rol resumido dentro de un usuario (GET /usuarios). */
export interface RolResumen {
  id: number;
  nombre: string;
}

/** Sucursal resumida dentro del empleado de un usuario. */
export interface SucursalResumen {
  id: number;
  nombre: string;
}

/** Empleado vinculado a un usuario interno. */
export interface EmpleadoResumen {
  id: number;
  nombres: string;
  apellidos: string;
  ci: string;
  telefono: string | null;
  fecha_contratacion: string;
  sucursal: SucursalResumen;
}

/** Usuario interno tal como lo devuelve el backend (sin password_hash). */
export interface Usuario {
  id: number;
  correo: string;
  estado: boolean;
  fecha_creacion: string;
  rol: RolResumen;
  empleado: EmpleadoResumen | null;
}

/** Respuesta de GET /usuarios (lista). */
export interface UsuarioListResponse {
  items: Usuario[];
}

/** Filtros opcionales admitidos por GET /usuarios. */
export interface UsuarioListarFiltros {
  buscar?: string;
  rol_id?: number;
  estado?: boolean;
  sucursal_id?: number;
}

/** Datos del empleado al crear un usuario interno. */
export interface EmpleadoCreatePayload {
  nombres: string;
  apellidos: string;
  ci: string;
  telefono: string | null;
  sucursal_id: number;
  fecha_contratacion: string;
}

/** Cuerpo de POST /usuarios. */
export interface UsuarioCreatePayload {
  correo: string;
  password: string;
  rol_id: number;
  empleado: EmpleadoCreatePayload;
}

/** Datos del empleado al actualizar (todos opcionales). */
export interface EmpleadoUpdatePayload {
  nombres?: string;
  apellidos?: string;
  ci?: string;
  telefono?: string | null;
  sucursal_id?: number;
  fecha_contratacion?: string;
}

/** Cuerpo de PATCH /usuarios/{usuario_id} (todos opcionales). */
export interface UsuarioUpdatePayload {
  correo?: string;
  password?: string;
  rol_id?: number;
  empleado?: EmpleadoUpdatePayload;
}

/** Cuerpo de PATCH /usuarios/{usuario_id}/estado. */
export interface UsuarioEstadoPayload {
  estado: boolean;
}
