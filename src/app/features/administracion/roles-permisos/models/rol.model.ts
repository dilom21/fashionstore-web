/**
 * Modelos de datos del dominio Roles (CU04).
 *
 * Los nombres de propiedad coinciden exactamente con el JSON real que expone
 * el backend FastAPI (GET/POST/PATCH /roles). No se convierten a camelCase
 * para mantener compatibilidad directa con la API.
 */

/** Rol tal como lo devuelve la lista (GET /roles) y las escrituras. */
export interface Rol {
  id: number;
  nombre: string;
  descripcion: string | null;
  estado: boolean;
}

/** Detalle de un rol (GET /roles/{rol_id}). */
export interface RolDetalle extends Rol {
  es_base: boolean;
  usuarios_activos: number;
}

/** Cuerpo de POST /roles. */
export interface RolCreateRequest {
  nombre: string;
  descripcion: string | null;
}

/** Cuerpo de PATCH /roles/{rol_id} (solo campos modificados). */
export interface RolUpdateRequest {
  nombre?: string;
  descripcion?: string | null;
}
