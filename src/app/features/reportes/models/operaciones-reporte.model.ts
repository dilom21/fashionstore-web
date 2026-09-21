import {
  MetadatosReporte,
  SerieTemporal,
} from './reportes-common.model';

// ===== Reservas =====

export interface ReservaEstado {
  estado: string;
  cantidad: number;
  unidades: number;
}

export interface ReservaSucursal {
  sucursal_id: number;
  sucursal_nombre: string;
  cantidad: number;
  unidades: number;
}

export interface ReservaResumen {
  total_reservas: number;
  cantidad_total_unidades: number;
  reservas_atendidas: number;
  reservas_convertidas_en_venta: number;
  /** Porcentaje ya calculado por el backend (atendidas -> venta COMPLETADA). */
  tasa_conversion: number;
}

/** `GET /reportes/reservas`. */
export interface ReporteReservasResponse {
  metadatos: MetadatosReporte;
  resumen: ReservaResumen;
  reservas_por_estado: ReservaEstado[];
  reservas_por_sucursal: ReservaSucursal[];
  evolucion: SerieTemporal[];
}

// ===== Devoluciones =====

export interface DevolucionEstado {
  estado: string;
  cantidad: number;
  unidades: number;
  valor_referencial: number;
}

export interface DevolucionSucursal {
  sucursal_id: number;
  sucursal_nombre: string;
  cantidad: number;
  unidades: number;
}

export interface DevolucionProducto {
  producto_id: number;
  producto_nombre: string;
  unidades: number;
  valor_referencial: number;
}

export interface DevolucionMotivo {
  motivo: string;
  cantidad_devoluciones: number;
  unidades: number;
}

export interface DevolucionResumen {
  total_devoluciones: number;
  completadas: number;
  unidades_devueltas: number;
  /** Valor REFERENCIAL del producto devuelto (nunca un reembolso). */
  valor_referencial: number;
}

/** `GET /reportes/devoluciones`. */
export interface ReporteDevolucionesResponse {
  metadatos: MetadatosReporte;
  resumen: DevolucionResumen;
  devoluciones_por_estado: DevolucionEstado[];
  devoluciones_por_sucursal: DevolucionSucursal[];
  evolucion: SerieTemporal[];
  productos_mas_devueltos: DevolucionProducto[];
  motivos_mas_frecuentes: DevolucionMotivo[];
}

// ===== Pagos (TRANSACCIONES, no ventas) =====

export interface PagoEstado {
  estado: string;
  cantidad: number;
  monto: number;
}

export interface PagoMetodo {
  metodo: string;
  cantidad: number;
  monto: number;
}

export interface PagoPasarela {
  pasarela: string;
  cantidad: number;
  monto: number;
}

export interface PagoResumen {
  cantidad_pagos: number;
  monto_total_procesado: number;
  monto_aprobado: number;
  /** Aclaración entregada por el backend. */
  nota: string;
}

/** `GET /reportes/pagos`. */
export interface ReportePagosResponse {
  metadatos: MetadatosReporte;
  resumen: PagoResumen;
  pagos_por_estado: PagoEstado[];
  pagos_por_metodo: PagoMetodo[];
  pagos_por_pasarela: PagoPasarela[];
  evolucion: SerieTemporal[];
}
