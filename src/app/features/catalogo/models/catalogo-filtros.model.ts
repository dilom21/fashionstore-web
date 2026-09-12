/**
 * Modelos de los filtros públicos del catálogo (CU09).
 *
 * Contrato real del backend FastAPI:
 *   GET /catalogo/filtros -> CatalogoFiltros
 *
 * Solo contiene opciones activas. No se hardcodean filtros en el frontend.
 */

/** Opción genérica de filtro (categoría, talla, color o temporada). */
export interface FiltroOpcion {
  id: number;
  nombre: string;
}

/** Colección activa con su temporada asociada. */
export interface ColeccionFiltro {
  id: number;
  nombre: string;
  temporada_id: number;
}

/** Sucursal activa con su ciudad (puede no estar definida). */
export interface SucursalFiltro {
  id: number;
  nombre: string;
  ciudad: string | null;
}

/** Respuesta completa de GET /catalogo/filtros. */
export interface CatalogoFiltros {
  categorias: FiltroOpcion[];
  tallas: FiltroOpcion[];
  colores: FiltroOpcion[];
  temporadas: FiltroOpcion[];
  colecciones: ColeccionFiltro[];
  sucursales: SucursalFiltro[];
}

/** Valores seleccionables del formulario de filtros del catálogo. */
export interface CatalogoFiltrosSeleccion {
  buscar: string;
  categoria_id: number | null;
  talla_id: number | null;
  color_id: number | null;
  temporada_id: number | null;
  coleccion_id: number | null;
  sucursal_id: number | null;
  con_stock: boolean;
}

/** Valores seleccionables del formulario de disponibilidad. */
export interface DisponibilidadFiltrosSeleccion {
  sucursal_id: number | null;
  talla_id: number | null;
  color_id: number | null;
  temporada_id: number | null;
}
