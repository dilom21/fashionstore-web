import { ColorResumen } from './color.model';

/**
 * Modelos del dominio Recursos de producto (CU07).
 *
 * El recurso se administra por URL (no existe upload/storage). El color es
 * opcional y solo puede haber un recurso principal activo por producto + color;
 * el backend realiza la sustitución al marcar otro como principal.
 */

/** Recurso tal como lo devuelve GET /productos/{producto_id}/recursos. */
export interface RecursoProducto {
  id: number;
  producto_id: number;
  color_id: number | null;
  tipo: string;
  url: string;
  es_principal: boolean;
  estado: boolean;
  color: ColorResumen | null;
}

/** Filtros opcionales admitidos por GET /productos/{producto_id}/recursos. */
export interface RecursoProductoListarFiltros {
  estado?: boolean;
}

/** Cuerpo de POST /productos/{producto_id}/recursos. */
export interface RecursoProductoCreatePayload {
  tipo: string;
  url: string;
  color_id: number | null;
  es_principal: boolean;
}

/** Cuerpo de PATCH /recursos-producto/{recurso_id}. */
export interface RecursoProductoUpdatePayload {
  tipo?: string;
  url?: string;
  color_id?: number | null;
  es_principal?: boolean;
}

/** Cuerpo de PATCH /recursos-producto/{recurso_id}/estado. */
export interface RecursoProductoEstadoPayload {
  estado: boolean;
}
