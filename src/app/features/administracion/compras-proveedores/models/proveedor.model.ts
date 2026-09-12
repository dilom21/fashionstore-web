/**
 * Modelos del dominio Proveedores (CU11).
 *
 * Contrato real del backend (FastAPI):
 * - GET   /proveedores                       -> Proveedor[]
 * - GET   /proveedores/{id}                  -> ProveedorDetalle
 * - POST  /proveedores                       -> Proveedor (201)
 * - PATCH /proveedores/{id}                  -> Proveedor
 * - PATCH /proveedores/{id}/estado           -> Proveedor
 * - GET   /proveedores/{id}/productos        -> ProveedorProductos
 * - PUT   /proveedores/{id}/productos        -> ProveedorProductos
 *
 * `costo_referencia` es Decimal y puede llegar como número o string; el
 * servicio lo normaliza a número para la UI conservando un payload compatible.
 *
 * Reglas reales del backend: `razon_social` obligatoria (no única), `nit`
 * opcional pero único si existe, `correo`/`telefono`/`direccion` opcionales.
 * No existe DELETE físico: el estado se cambia con PATCH /estado.
 */

/** Proveedor tal como lo devuelve GET /proveedores. */
export interface Proveedor {
  id: number;
  razon_social: string;
  nit: string | null;
  correo: string | null;
  telefono: string | null;
  direccion: string | null;
  estado: boolean;
}

/** Detalle de proveedor (GET /proveedores/{id}) con el total de productos. */
export interface ProveedorDetalle extends Proveedor {
  total_productos: number;
}

/** Filtros opcionales admitidos por GET /proveedores. */
export interface ProveedorListarFiltros {
  buscar?: string;
  estado?: boolean;
}

/** Cuerpo de POST /proveedores. */
export interface ProveedorCreatePayload {
  razon_social: string;
  nit: string | null;
  correo: string | null;
  telefono: string | null;
  direccion: string | null;
}

/** Cuerpo de PATCH /proveedores/{proveedor_id} (solo campos modificados). */
export interface ProveedorUpdatePayload {
  razon_social?: string;
  nit?: string | null;
  correo?: string | null;
  telefono?: string | null;
  direccion?: string | null;
}

/** Cuerpo de PATCH /proveedores/{proveedor_id}/estado. */
export interface ProveedorEstadoPayload {
  estado: boolean;
}

/** Producto asociado a un proveedor (GET /proveedores/{id}/productos). */
export interface ProveedorProducto {
  producto_id: number;
  nombre: string;
  categoria: string | null;
  costo_referencia: number;
  /** Estado de la relación proveedor_producto. */
  estado: boolean;
}

/** Respuesta de GET/PUT /proveedores/{proveedor_id}/productos. */
export interface ProveedorProductos {
  proveedor_id: number;
  total: number;
  productos: ProveedorProducto[];
}

/** Elemento del payload de PUT /proveedores/{id}/productos. */
export interface ProveedorProductoInput {
  producto_id: number;
  costo_referencia: number;
  estado: boolean;
}

/** Cuerpo de PUT /proveedores/{proveedor_id}/productos (reemplazo total). */
export interface ProveedorProductosUpdatePayload {
  productos: ProveedorProductoInput[];
}
