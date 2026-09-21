import { MetadatosReporte } from './reportes-common.model';

/**
 * Compras por cliente (`ClienteCompraResponse`).
 *
 * PII minimizada: id, nombre y apellido únicamente (sin CI ni teléfono).
 */
export interface ClienteCompra {
  cliente_id: number;
  nombre: string;
  apellido: string;
  compras: number;
  unidades: number;
  monto: number;
}

/** Resumen de clientes (`ClientesResumenResponse`). */
export interface ClientesResumen {
  clientes_compradores: number;
  clientes_recurrentes: number;
  compras_totales: number;
  unidades_totales: number;
  monto_total: number;
}

/** Carritos por estado (`CarritoEstadoResponse`). */
export interface CarritoEstado {
  estado: string;
  cantidad: number;
}

/** Resumen de carritos (`CarritosResumenResponse`). */
export interface CarritosResumen {
  total_carritos: number;
  carritos_convertidos: number;
  /** Porcentaje ya calculado por el backend. */
  tasa_conversion_carrito: number;
  por_estado: CarritoEstado[];
}

/** `GET /reportes/clientes-carritos` (no acepta `agrupacion`). */
export interface ReporteClientesCarritosResponse {
  metadatos: MetadatosReporte;
  resumen_clientes: ClientesResumen;
  compras_por_cliente: ClienteCompra[];
  resumen_carritos: CarritosResumen;
}
