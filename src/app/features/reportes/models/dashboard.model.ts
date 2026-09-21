import {
  MetadatosReporte,
  SerieTemporal,
} from './reportes-common.model';

/** KPIs del dashboard (`DashboardKpisResponse`). */
export interface DashboardKpis {
  ventas_completadas: number;
  total_vendido: number;
  unidades_vendidas: number;
  ticket_promedio: number;
  reservas_total: number;
  devoluciones_completadas: number;
  unidades_devueltas: number;
  stock_disponible_total: number;
}

/** Ventas por canal (`VentasCanalResponse`). */
export interface VentasCanal {
  canal: string;
  cantidad_ventas: number;
  monto: number;
  unidades: number;
}

/** Producto del top (`TopProductoResponse`). */
export interface TopProducto {
  producto_id: number;
  producto_nombre: string;
  unidades: number;
  monto: number;
}

/** Conteo por estado (`ConteoEstadoResponse`). */
export interface ConteoEstado {
  estado: string;
  cantidad: number;
}

/** Resumen de reservas (`ResumenReservasResponse`). */
export interface ResumenReservas {
  total: number;
  por_estado: ConteoEstado[];
}

/** Resumen de devoluciones (`ResumenDevolucionesResponse`). */
export interface ResumenDevoluciones {
  total: number;
  completadas: number;
  unidades_devueltas: number;
  /** Valor REFERENCIAL (CU25 no reembolsa dinero). */
  valor_referencial: number;
  por_estado: ConteoEstado[];
}

/** Resumen de inventario (`ResumenInventarioResponse`). */
export interface ResumenInventario {
  stock_actual_total: number;
  stock_reservado_total: number;
  stock_disponible_total: number;
  variantes_agotadas: number;
  variantes_stock_bajo: number;
}

/** Comparativo por sucursal (`SucursalComparadaResponse`). */
export interface SucursalComparada {
  sucursal_id: number;
  sucursal_nombre: string;
  ventas: number;
  monto_vendido: number;
  unidades: number;
  ticket_promedio: number;
  reservas: number;
  devoluciones: number;
}

/** `GET /reportes/dashboard`. */
export interface DashboardResponse {
  metadatos: MetadatosReporte;
  kpis: DashboardKpis;
  ventas_evolucion: SerieTemporal[];
  ventas_por_canal: VentasCanal[];
  top_productos: TopProducto[];
  resumen_reservas: ResumenReservas;
  resumen_devoluciones: ResumenDevoluciones;
  resumen_inventario: ResumenInventario;
  comparativo_sucursales: SucursalComparada[];
}
