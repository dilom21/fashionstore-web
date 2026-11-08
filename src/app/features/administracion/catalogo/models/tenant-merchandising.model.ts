export interface TenantTemporada {
  id: number;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: boolean;
}

export interface TenantTemporadaDetalle extends TenantTemporada {
  total_colecciones: number;
}

export interface TenantColeccion {
  id: number;
  temporada_id: number;
  nombre: string;
  descripcion: string | null;
  estado: boolean;
}

export interface TenantColeccionDetalle extends TenantColeccion {
  temporada: TenantTemporada;
  total_productos: number;
}

export interface TenantProductoResumen {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
  estado: boolean;
  categoria_id: number;
}

export interface TenantProductosAsociados {
  coleccion_id?: number;
  promocion_id?: number;
  total: number;
  productos: TenantProductoResumen[];
}

export type TenantTipoDescuento = 'PORCENTAJE' | 'MONTO';

export interface TenantPromocion {
  id: number;
  nombre: string;
  descripcion: string | null;
  tipo_descuento: TenantTipoDescuento;
  valor_descuento: number;
  fecha_inicio: string;
  fecha_fin: string;
  estado: boolean;
}

export interface TenantPrecioPromocional {
  producto_id: number;
  precio_base: number;
  promociones_vigentes: TenantPromocion[];
  precio_promocional: number | null;
  precio_definitivo: boolean;
}
