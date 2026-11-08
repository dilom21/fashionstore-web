/**
 * Modelos del dominio Variantes de producto (CU06).
 *
 * El backend normaliza el SKU a MAYÚSCULAS y garantiza unicidad de SKU y de la
 * combinación producto + talla + color.
 */

/** Variante tenant con IDs y nombres planos entregados por el backend. */
export interface Variante {
  id: number;
  producto_id: number;
  sku: string;
  estado: boolean;
  talla_id: number;
  talla: string;
  color_id: number;
  color: string;
}

/** Filtros opcionales admitidos por GET /productos/{producto_id}/variantes. */
export interface VarianteListarFiltros {
  estado?: boolean;
}

/** Cuerpo de POST /productos/{producto_id}/variantes. */
export interface VarianteCreatePayload {
  talla_id: number;
  color_id: number;
  sku: string;
}

/** Cuerpo de PATCH /variantes/{variante_id} (solo campos modificados). */
export interface VarianteUpdatePayload {
  talla_id?: number;
  color_id?: number;
  sku?: string;
}

/** Cuerpo de PATCH /variantes/{variante_id}/estado. */
export interface VarianteEstadoPayload {
  estado: boolean;
}
