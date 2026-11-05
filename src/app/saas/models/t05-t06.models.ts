export interface PublicCompany {
  id: number;
  slug: string;
  nombre_comercial: string;
}

export interface PublicListResponse<T> {
  empresa: PublicCompany;
  items: T[];
}

export interface PublicProduct {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: string;
  categoria_id: number;
  categoria_nombre: string;
  imagen_url: string | null;
  stock_disponible: number;
}

export interface PublicBranch {
  id: number;
  nombre: string;
  direccion: string;
  telefono: string | null;
  ciudad_id: number;
  ciudad_nombre: string;
}

export interface TenantSeason {
  id: number;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: boolean;
}

export interface TenantPromotion {
  id: number;
  nombre: string;
  descripcion: string | null;
  tipo_descuento: 'PORCENTAJE' | 'MONTO';
  valor_descuento: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: boolean;
}

export interface TenantReportSummary {
  periodo: { fecha_desde: string | null; fecha_hasta: string | null };
  sucursal_id: number | null;
  ventas_completadas: number;
  ventas_pendientes: number;
  total_vendido: string;
  ticket_promedio: string;
  reservas_total: number;
  reservas_pendientes: number;
  productos_activos: number;
  stock_actual: number;
  stock_reservado: number;
  stock_disponible: number;
}

export interface TenantGeneratedReport {
  fuente: TenantReportSummary;
  resumen: string;
  alertas: string[];
}

export interface TenantDynamicReport {
  tipo: string;
  pregunta: string | null;
  filtros: { fecha_desde: string | null; fecha_hasta: string | null };
  resumen: TenantReportSummary;
  filas: Array<{ metrica: string; valor: number | string }>;
  serie: Array<{ label: string; value: number | string }>;
}

export interface TenantMLReport {
  tenant_id: number;
  supervisado: { modelo: string; accuracy: number; muestras: number };
  no_supervisado: { modelo: string; silhouette: number; muestras: number };
  serie: Array<{ grupo: string; cantidad: number }>;
}
