/**
 * Modelos del dominio Categorías (CU07).
 *
 * Los nombres de propiedad coinciden exactamente con el JSON real del backend
 * FastAPI (snake_case). No se convierten a camelCase para mantener
 * compatibilidad directa con la API.
 */

/** Categoría tal como la devuelve GET /categorias y GET /categorias/admin. */
export interface Categoria {
  id: number;
  nombre: string;
  descripcion: string | null;
  estado: boolean;
}

/** Referencia mínima de categoría anidada en los productos. */
export interface CategoriaResumen {
  id: number;
  nombre: string;
}

/** Filtros opcionales admitidos por GET /categorias/admin. */
export interface CategoriaListarFiltros {
  buscar?: string;
  estado?: boolean;
}

/** Cuerpo de POST /categorias. */
export interface CategoriaCreatePayload {
  nombre: string;
  descripcion: string | null;
}

/** Cuerpo de PATCH /categorias/{categoria_id} (solo campos modificados). */
export interface CategoriaUpdatePayload {
  nombre?: string;
  descripcion?: string | null;
}

/** Cuerpo de PATCH /categorias/{categoria_id}/estado. */
export interface CategoriaEstadoPayload {
  estado: boolean;
}
