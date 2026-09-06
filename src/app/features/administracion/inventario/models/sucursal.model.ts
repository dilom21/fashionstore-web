/**
 * Modelos de datos del dominio Sucursales (CU06).
 *
 * Los nombres de propiedad coinciden exactamente con el JSON real que expone
 * el backend FastAPI (GET/POST/PATCH /sucursales). No se convierten a
 * camelCase para mantener compatibilidad directa con la API.
 */

/** Ciudad resumida anidada en cada sucursal. */
export interface CiudadResumen {
  id: number;
  nombre: string;
}

/** Sucursal tal como la devuelve GET /sucursales y GET /sucursales/{id}. */
export interface Sucursal {
  id: number;
  nombre: string;
  direccion: string;
  telefono: string | null;
  estado: boolean;
  ciudad: CiudadResumen;
}

/** Filtros opcionales admitidos por GET /sucursales. */
export interface SucursalListarFiltros {
  buscar?: string;
  ciudad_id?: number;
  estado?: boolean;
}

/** Cuerpo de POST /sucursales. */
export interface SucursalCreatePayload {
  nombre: string;
  ciudad_id: number;
  direccion: string;
  telefono: string | null;
}

/** Cuerpo de PATCH /sucursales/{sucursal_id} (solo campos modificados). */
export interface SucursalUpdatePayload {
  nombre?: string;
  ciudad_id?: number;
  direccion?: string;
  telefono?: string | null;
}

/** Cuerpo de PATCH /sucursales/{sucursal_id}/estado. */
export interface SucursalEstadoPayload {
  estado: boolean;
}
