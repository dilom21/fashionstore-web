export type TipoReporteGenerativo =
  | 'VENTAS_SUCURSAL'
  | 'PRODUCTOS_TOP'
  | 'EVOLUCION_VENTAS'
  | 'INVENTARIO_BAJO';

export interface ReporteGenerativoFila {
  etiqueta: string;
  valores: Record<string, string | number | null>;
}

export interface ReporteGenerativoResponse {
  consulta: string;
  tipo: TipoReporteGenerativo;
  titulo: string;
  resumen: string | null;
  filtros_aplicados: {
    tipo: TipoReporteGenerativo;
    fecha_desde: string | null;
    fecha_hasta: string | null;
    sucursal_id: number | null;
    top: number;
    agrupacion: 'DIA' | 'MES';
    umbral_stock_bajo: number;
  };
  fuente: string;
  proveedor_ia: string;
  sin_resultados: boolean;
  filas: ReporteGenerativoFila[];
  grafico: {
    tipo: 'BAR' | 'LINE';
    etiqueta: string;
    categorias: string[];
    valores: number[];
  } | null;
}
