import { ColorResumen } from './color.model';
import { TallaResumen } from './talla.model';

/**
 * Modelos del dominio Variantes de producto (CU07).
 *
 * El backend normaliza el SKU a MAYÚSCULAS y garantiza unicidad de SKU y de la
 * combinación producto + talla + color.
 */

/** Variante tal como la devuelve GET /productos/{producto_id}/variantes. */
export interface Variante {
  id: number;
  producto_id: number;
  sku: string;
  estado: boolean;
  talla: TallaResumen;
  color: ColorResumen;
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
