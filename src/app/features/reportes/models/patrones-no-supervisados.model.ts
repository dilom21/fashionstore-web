export interface PatronesRequest {
  periodo_dias: 30 | 90;
  sucursal_id: number | null;
  max_productos: number;
}

export interface ClusterPatrones {
  cluster_id: number;
  etiqueta: string;
  productos: number;
  unidades_promedio: number;
  ingresos_promedio: number;
  stock_promedio: number;
}

export interface ProductoPatron {
  producto_id: number;
  producto_nombre: string;
  cluster_id: number;
  etiqueta: string;
  unidades_vendidas: number;
  ingresos: number;
  dias_con_ventas: number;
  stock_disponible: number;
}

export interface PatronesResponse {
  tipo: 'PATRONES_NO_SUPERVISADOS';
  analisis_id: string;
  generado_en: string;
  periodo_dias: 30 | 90;
  fecha_desde: string;
  fecha_hasta: string;
  sucursal_id: number | null;
  sucursal_nombre: string | null;
  modelo: string;
  version_modelo: string;
  procedencia_entrenamiento: 'SINTETICO';
  procedencia_datos: 'REALES_TENANT';
  features: string[];
  observaciones: number;
  metricas_evaluacion: { silhouette: number | null; inertia: number | null; clusters_entrenamiento: number | null };
  clusters: ClusterPatrones[];
  productos: ProductoPatron[];
  advertencias: string[];
  estado: 'OK' | 'SIN_DATOS' | 'NO_DISPONIBLE';
}
