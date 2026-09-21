import {
  MetadatosReporte,
  PaginacionReporte,
  SerieTemporal,
} from './reportes-common.model';

/** KPIs del reporte de ventas (`VentaResumenKpisResponse`). */
export interface VentaResumenKpis {
  ventas_completadas: number;
  monto_total: number;
  unidades_vendidas: number;
  ticket_promedio: number;
}

/** Ventas por estado (`VentaEstadoResponse`). */
export interface VentaEstado {
  estado: string;
  cantidad: number;
  monto: number;
}

/** Ventas por canal (`VentaCanalResponse`). */
export interface VentaCanal {
  canal: string;
  cantidad: number;
  monto: number;
  unidades: number;
}

/** Ventas por sucursal (`VentaSucursalResponse`). */
export interface VentaSucursal {
  sucursal_id: number;
  sucursal_nombre: string;
  cantidad: number;
  monto: number;
  unidades: number;
  ticket_promedio: number;
}

/** Ventas por empleado (`VentaEmpleadoResponse`). */
export interface VentaEmpleado {
  empleado_id: number;
  empleado_nombre: string;
  cantidad: number;
  monto: number;
}

/** Fila de la tabla paginada (`VentaTablaItemResponse`). */
export interface VentaTablaItem {
  venta_id: number;
  fecha_hora: string;
  sucursal: string;
  canal: string;
  estado: string;
  cliente_nombre: string | null;
  empleado_nombre: string | null;
  cantidad_unidades: number;
  total: number;
}

/** `GET /reportes/ventas`. */
export interface ReporteVentasResponse {
  metadatos: MetadatosReporte;
  resumen: VentaResumenKpis;
  ventas_por_estado: VentaEstado[];
  ventas_por_canal: VentaCanal[];
  ventas_por_sucursal: VentaSucursal[];
  ventas_por_empleado: VentaEmpleado[];
  evolucion: SerieTemporal[];
  paginacion: PaginacionReporte;
  items: VentaTablaItem[];
}
