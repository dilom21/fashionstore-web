import { CategoriaResumen } from './categoria.model';
import { ColorResumen } from './color.model';
import { TallaResumen } from './talla.model';

/**
 * Modelos del dominio Productos (CU07).
 *
 * Incluye tanto el contrato administrativo (CU07) como el contrato público
 * ya existente en el backend (GET /productos, GET /productos/{id},
 * GET /productos/{id}/disponibilidad), para no romper el catálogo público ni
 * el futuro CU09.
 */

/** Producto tal como lo devuelve GET /productos y GET /productos/admin. */
export interface Producto {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
  estado: boolean;
  categoria_id: number;
  categoria: CategoriaResumen;
  /**
   * URL absoluta de la imagen principal del producto (campo aditivo de
   * GET /productos). Es `null` cuando el producto no tiene una imagen
   * principal marcada en el backend. La URL ya viene resuelta: el frontend no
   * debe construirla ni asumir nombres de archivo.
   */
  imagen_principal_url: string | null;
}

/**
 * Filtros opcionales admitidos por GET /productos y GET /productos/admin.
 *
 * El contrato público CU09 admite todos los campos salvo `estado`; el contrato
 * administrativo solo usa `buscar`, `categoria_id` y `estado`. Al compartir la
 * misma interfaz, los campos no aplicables simplemente se omiten.
 */
export interface ProductoListarFiltros {
  buscar?: string;
  categoria_id?: number;
  talla_id?: number;
  color_id?: number;
  temporada_id?: number;
  coleccion_id?: number;
  sucursal_id?: number;
  con_stock?: boolean;
  estado?: boolean;
}

/** Filtros opcionales admitidos por GET /productos/{id}/disponibilidad. */
export interface DisponibilidadListarFiltros {
  sucursal_id?: number;
  talla_id?: number;
  color_id?: number;
  temporada_id?: number;
}

/** Cuerpo de POST /productos. */
export interface ProductoCreatePayload {
  categoria_id: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
}

/** Cuerpo de PATCH /productos/{producto_id} (solo campos modificados). */
export interface ProductoUpdatePayload {
  categoria_id?: number;
  nombre?: string;
  descripcion?: string | null;
  precio?: number;
}

/** Cuerpo de PATCH /productos/{producto_id}/estado. */
export interface ProductoEstadoPayload {
  estado: boolean;
}

// ---------------------------------------------------------------------------
// Contrato público (NO modificar los endpoints existentes)
// ---------------------------------------------------------------------------

/** Sucursal resumida dentro de un inventario público. */
export interface SucursalResumen {
  id: number;
  nombre: string;
  direccion: string;
}

/** Temporada resumida dentro de un inventario público. */
export interface TemporadaResumen {
  id: number;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
}

/** Inventario de una variante en una sucursal (contrato público). */
export interface InventarioDetalle {
  id: number;
  stock_actual: number;
  stock_reservado: number;
  stock_disponible: number;
  fecha_actualizacion: string;
  sucursal: SucursalResumen;
  temporada: TemporadaResumen;
}

/** Variante con inventarios (contrato público de detalle de producto). */
export interface VarianteProductoDetalle {
  id: number;
  sku: string;
  estado: boolean;
  talla: TallaResumen;
  color: ColorResumen;
  inventarios: InventarioDetalle[];
}

/** Recurso de producto (contrato público de detalle de producto). */
export interface RecursoProductoDetalle {
  id: number;
  tipo: string;
  url: string;
  es_principal: boolean;
  color: ColorResumen | null;
}

/** Producto con variantes y recursos (GET /productos/{producto_id}). */
export interface ProductoDetalle extends Producto {
  recursos: RecursoProductoDetalle[];
  variantes: VarianteProductoDetalle[];
}

/** Variante disponible en una sucursal (contrato público). */
export interface DisponibilidadVariante {
  variante_id: number;
  sku: string;
  talla: string;
  color: string;
  temporada: string;
  stock_disponible: number;
}

/** Sucursal con variantes disponibles (contrato público). */
export interface DisponibilidadSucursal {
  sucursal_id: number;
  sucursal: string;
  variantes: DisponibilidadVariante[];
}

/** Disponibilidad de un producto (GET /productos/{id}/disponibilidad). */
export interface DisponibilidadProducto {
  producto_id: number;
  producto: string;
  sucursales: DisponibilidadSucursal[];
}
