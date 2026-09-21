import { MetadatosReporte } from './reportes-common.model';

/** Producto del ranking (`ProductoRankingResponse`). */
export interface ProductoRanking {
  producto_id: number;
  producto_nombre: string;
  categoria: string;
  unidades: number;
  monto: number;
}

/** Variante del ranking (`VarianteRankingResponse`). */
export interface VarianteRanking {
  variante_producto_id: number;
  sku: string;
  producto_nombre: string;
  talla: string;
  color: string;
  unidades: number;
  monto: number;
}

/** Ranking por etiqueta: categoría, talla, color, temporada, colección. */
export interface EtiquetaRanking {
  etiqueta: string;
  unidades: number;
  monto: number;
}

/** Resumen de catálogo (`ResumenCatalogoResponse`). */
export interface ResumenCatalogo {
  productos_activos: number;
  productos_inactivos: number;
  variantes_activas: number;
  variantes_inactivas: number;
}

/**
 * `GET /reportes/productos`.
 *
 * `ventas_por_coleccion` cuenta cada línea en CADA colección del producto
 * (relación M:N), por lo que su suma puede superar el total global.
 */
export interface ReporteProductosResponse {
  metadatos: MetadatosReporte;
  top_productos_por_unidades: ProductoRanking[];
  top_productos_por_monto: ProductoRanking[];
  ventas_por_categoria: EtiquetaRanking[];
  variantes_mas_vendidas: VarianteRanking[];
  tallas_mas_vendidas: EtiquetaRanking[];
  colores_mas_vendidos: EtiquetaRanking[];
  ventas_por_temporada: EtiquetaRanking[];
  ventas_por_coleccion: EtiquetaRanking[];
  resumen_catalogo: ResumenCatalogo;
}
