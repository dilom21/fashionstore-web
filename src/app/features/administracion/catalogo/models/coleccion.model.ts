import { TemporadaResumen } from './temporada.model';

/**
 * Modelos del dominio Colecciones y su asignación de productos (CU08).
 *
 * Contrato real del backend (FastAPI):
 * - GET   /colecciones                          -> Coleccion[]
 * - GET   /colecciones/{id}                     -> ColeccionDetalle
 * - POST  /colecciones                          -> Coleccion (201)
 * - PATCH /colecciones/{id}                     -> Coleccion
 * - PATCH /colecciones/{id}/estado              -> Coleccion
 * - GET   /colecciones/{id}/productos           -> ColeccionProductos
 * - PUT   /colecciones/{id}/productos           -> ColeccionProductos
 *
 * Importante: el listado (GET /colecciones) NO incluye `temporada` ni
 * `total_productos`; solo el detalle (GET /colecciones/{id}) los expone.
 */

/** Colección tal como la devuelve el listado. */
export interface Coleccion {
  id: number;
  temporada_id: number;
  nombre: string;
  descripcion: string | null;
  estado: boolean;
}

/** Colección con temporada resumida y total de productos (detalle). */
export interface ColeccionDetalle extends Coleccion {
  temporada: TemporadaResumen;
  total_productos: number;
}

/** Filtros admitidos por GET /colecciones. */
export interface ColeccionListarFiltros {
  buscar?: string;
  temporada_id?: number;
  estado?: boolean;
}

/** Cuerpo de POST /colecciones. */
export interface ColeccionCreatePayload {
  temporada_id: number;
  nombre: string;
  descripcion: string | null;
}

/** Cuerpo de PATCH /colecciones/{coleccion_id} (solo campos modificados). */
export interface ColeccionUpdatePayload {
  temporada_id?: number;
  nombre?: string;
  descripcion?: string | null;
}

/** Cuerpo de PATCH /colecciones/{coleccion_id}/estado. */
export interface ColeccionEstadoPayload {
  estado: boolean;
}

/** Producto resumido devuelto al consultar los productos de una colección. */
export interface ProductoColeccionResumen {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
  estado: boolean;
  categoria_id: number;
}

/** Respuesta de GET/PUT /colecciones/{coleccion_id}/productos. */
export interface ColeccionProductos {
  coleccion_id: number;
  total: number;
  productos: ProductoColeccionResumen[];
}

/** Cuerpo de PUT /colecciones/{coleccion_id}/productos (reemplazo total). */
export interface ColeccionProductosUpdatePayload {
  producto_ids: number[];
}
