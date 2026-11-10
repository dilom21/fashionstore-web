export interface PrediccionRequest {
  producto_id: number;
  sucursal_id: number | null;
  horizonte_dias: 7 | 30;
}

export interface PrediccionResponse {
  tipo: 'DEMANDA_UNIDADES';
  horizonte_dias: 7 | 30;
  unidad: 'UNIDADES_VENDIDAS';
  producto_id: number;
  producto_nombre: string;
  sucursal_id: number | null;
  sucursal_nombre: string | null;
  fecha_corte_datos: string;
  valor_predicho: number;
  historico_dias: number;
  modelo: string;
  version_modelo: string;
  procedencia_entrenamiento: 'SINTETICO';
  metricas_validacion: Record<string, number>;
  baseline_metricas_test: Record<string, number>;
  aviso: string;
}
