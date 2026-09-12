/**
 * Modelos del dominio Tallas (CU07).
 *
 * Los nombres de propiedad coinciden exactamente con el JSON real del backend
 * FastAPI (snake_case).
 */

/** Talla tal como la devuelve GET /tallas y GET /tallas/{talla_id}. */
export interface Talla {
  id: number;
  nombre: string;
  estado: boolean;
}

/** Referencia mínima de talla anidada en las variantes. */
export interface TallaResumen {
  id: number;
  nombre: string;
}

/** Filtros opcionales admitidos por GET /tallas. */
export interface TallaListarFiltros {
  buscar?: string;
  estado?: boolean;
}

/** Cuerpo de POST /tallas. */
export interface TallaCreatePayload {
  nombre: string;
}

/** Cuerpo de PATCH /tallas/{talla_id} (solo campos modificados). */
export interface TallaUpdatePayload {
  nombre?: string;
}

/** Cuerpo de PATCH /tallas/{talla_id}/estado. */
export interface TallaEstadoPayload {
  estado: boolean;
}
