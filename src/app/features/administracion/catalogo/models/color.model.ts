/**
 * Modelos del dominio Colores (CU07).
 *
 * Los nombres de propiedad coinciden exactamente con el JSON real del backend
 * FastAPI (snake_case). La tabla de colores NO tiene código hexadecimal: solo
 * nombre y estado.
 */

/** Color tal como lo devuelve GET /colores y GET /colores/{color_id}. */
export interface Color {
  id: number;
  nombre: string;
  estado: boolean;
}

/** Referencia mínima de color anidada en variantes y recursos. */
export interface ColorResumen {
  id: number;
  nombre: string;
}

/** Filtros opcionales admitidos por GET /colores. */
export interface ColorListarFiltros {
  buscar?: string;
  estado?: boolean;
}

/** Cuerpo de POST /colores. */
export interface ColorCreatePayload {
  nombre: string;
}

/** Cuerpo de PATCH /colores/{color_id} (solo campos modificados). */
export interface ColorUpdatePayload {
  nombre?: string;
}

/** Cuerpo de PATCH /colores/{color_id}/estado. */
export interface ColorEstadoPayload {
  estado: boolean;
}
