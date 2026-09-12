/**
 * Modelos del dominio Temporadas (CU08).
 *
 * Contrato real del backend (FastAPI):
 * - GET /temporadas               -> Temporada[]
 * - GET /temporadas/{id}          -> Temporada
 * - POST /temporadas              -> Temporada (201)
 * - PATCH /temporadas/{id}        -> Temporada
 * - PATCH /temporadas/{id}/estado -> Temporada
 *
 * Las fechas llegan como `date` (YYYY-MM-DD) y `estado` es booleano.
 */

/** Temporada tal como la devuelve el backend. */
export interface Temporada {
  id: number;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: boolean;
}

/** Temporada resumida incluida dentro del detalle de una colección. */
export interface TemporadaResumen {
  id: number;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: boolean;
}

/** Filtros admitidos por GET /temporadas. */
export interface TemporadaListarFiltros {
  buscar?: string;
  estado?: boolean;
}

/** Cuerpo de POST /temporadas. */
export interface TemporadaCreatePayload {
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
}

/** Cuerpo de PATCH /temporadas/{temporada_id} (solo campos modificados). */
export interface TemporadaUpdatePayload {
  nombre?: string;
  fecha_inicio?: string;
  fecha_fin?: string;
}

/** Cuerpo de PATCH /temporadas/{temporada_id}/estado. */
export interface TemporadaEstadoPayload {
  estado: boolean;
}
