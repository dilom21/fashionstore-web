/**
 * Modelos de datos del dominio Ciudades (CU06).
 *
 * Los nombres de propiedad coinciden exactamente con el JSON real que expone
 * el backend FastAPI (GET/POST/PATCH /ciudades). No se convierten a camelCase
 * para mantener compatibilidad directa con la API.
 */

/** Ciudad tal como la devuelve GET /ciudades y GET /ciudades/{ciudad_id}. */
export interface Ciudad {
  id: number;
  nombre: string;
  estado: boolean;
}

/** Filtros opcionales admitidos por GET /ciudades. */
export interface CiudadListarFiltros {
  buscar?: string;
  estado?: boolean;
}

/** Cuerpo de POST /ciudades. */
export interface CiudadCreatePayload {
  nombre: string;
}

/** Cuerpo de PATCH /ciudades/{ciudad_id} (solo campos modificados). */
export interface CiudadUpdatePayload {
  nombre?: string;
}

/** Cuerpo de PATCH /ciudades/{ciudad_id}/estado. */
export interface CiudadEstadoPayload {
  estado: boolean;
}
