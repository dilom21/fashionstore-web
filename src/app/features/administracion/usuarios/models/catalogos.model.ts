/**
 * Catálogos de referencia para Gestión de Usuarios (CU03): sucursales activas.
 * El catálogo de roles hoy vive en roles-permisos/models/rol.model.ts
 * (compartido entre CU03 y CU04) y se carga desde API real; nunca se
 * hardcodea en la interfaz.
 */

/** Ciudad resumida de una sucursal. */
export interface CiudadResumen {
  id: number;
  nombre: string;
}

/** Sucursal activa (GET /sucursales). */
export interface SucursalActiva {
  id: number;
  nombre: string;
  direccion: string;
  telefono: string | null;
  estado: boolean;
  ciudad: CiudadResumen;
}
