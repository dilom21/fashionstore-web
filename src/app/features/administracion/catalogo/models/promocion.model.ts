/**
 * Modelos del dominio Promociones (CU10).
 *
 * Contrato real del backend (FastAPI):
 * - GET   /promociones                        -> Promocion[]
 * - GET   /promociones/{id}                   -> Promocion
 * - POST  /promociones                        -> Promocion (201)
 * - PATCH /promociones/{id}                   -> Promocion
 * - PATCH /promociones/{id}/estado            -> Promocion
 * - GET   /promociones/{id}/productos         -> PromocionProductos
 * - PUT   /promociones/{id}/productos         -> PromocionProductos
 *
 * Las fechas son TIMESTAMPTZ (ISO 8601) y `estado` es booleano. `valor_descuento`
 * puede llegar como número o string (Decimal); el servicio lo normaliza a número.
 *
 * Reglas reales del backend: nombre obligatorio, valor_descuento > 0,
 * PORCENTAJE <= 100, fecha_inicio <= fecha_fin. No hay DELETE físico.
 */

/** Tipo de descuento admitido por el backend. */
export type TipoDescuento = 'PORCENTAJE' | 'MONTO';

/** Promoción tal como la devuelve el backend. */
export interface Promocion {
  id: number;
  nombre: string;
  descripcion: string | null;
  tipo_descuento: TipoDescuento;
  valor_descuento: number;
  fecha_inicio: string;
  fecha_fin: string;
  estado: boolean;
}

/**
 * Detalle de una promoción (GET /promociones/{id}).
 *
 * El backend devuelve el mismo contrato que el listado; se conserva el alias
 * para reflejar el endpoint de detalle sin inventar campos no confirmados.
 */
export type PromocionDetalle = Promocion;

/** Filtros admitidos por GET /promociones. */
export interface PromocionListarFiltros {
  buscar?: string;
  estado?: boolean;
  tipo_descuento?: TipoDescuento;
}

/** Cuerpo de POST /promociones. */
export interface PromocionCreatePayload {
  nombre: string;
  descripcion: string | null;
  tipo_descuento: TipoDescuento;
  valor_descuento: number;
  fecha_inicio: string;
  fecha_fin: string;
}

/** Cuerpo de PATCH /promociones/{promocion_id} (solo campos modificados). */
export interface PromocionUpdatePayload {
  nombre?: string;
  descripcion?: string | null;
  tipo_descuento?: TipoDescuento;
  valor_descuento?: number;
  fecha_inicio?: string;
  fecha_fin?: string;
}

/** Cuerpo de PATCH /promociones/{promocion_id}/estado. */
export interface PromocionEstadoPayload {
  estado: boolean;
}

/** Producto resumido devuelto al consultar los productos de una promoción. */
export interface PromocionProducto {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
  estado: boolean;
  categoria_id: number;
}

/** Respuesta de GET/PUT /promociones/{promocion_id}/productos. */
export interface PromocionProductos {
  promocion_id: number;
  total: number;
  productos: PromocionProducto[];
}

/** Cuerpo de PUT /promociones/{promocion_id}/productos (reemplazo total). */
export interface PromocionProductosUpdatePayload {
  producto_ids: number[];
}
