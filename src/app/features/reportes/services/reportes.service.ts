import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { ReporteAuditoriaResponse } from '../models/auditoria-reporte.model';
import { ReporteClientesCarritosResponse } from '../models/clientes-reporte.model';
import { ReporteComprasResponse } from '../models/compras-reporte.model';
import { DashboardResponse } from '../models/dashboard.model';
import { ReporteInventarioResponse } from '../models/inventario-reporte.model';
import {
  DevolucionEstado,
  PagoEstado,
  PagoMetodo,
  PagoPasarela,
  ReservaEstado,
  ReporteDevolucionesResponse,
  ReportePagosResponse,
  ReporteReservasResponse,
} from '../models/operaciones-reporte.model';
import { ReporteProductosResponse } from '../models/productos-reporte.model';
import {
  FormatoExportacion,
  MontoFila,
  PaginacionReporte,
  ReportesFiltros,
  SerieTemporal,
  TipoReporte,
} from '../models/reportes-common.model';
import { ReporteVentasResponse } from '../models/ventas-reporte.model';

/** Archivo descargable devuelto por `GET /reportes/exportar/{tipo}`. */
export interface ReporteExportado {
  blob: Blob;
  nombre: string;
}

const num = (valor: number | string | null | undefined): number =>
  valor === null || valor === undefined ? 0 : Number(valor);

const numOrNull = (
  valor: number | string | null | undefined,
): number | null =>
  valor === null || valor === undefined ? null : Number(valor);

const serie = (punto: SerieTemporal): SerieTemporal => ({
  periodo: punto.periodo,
  cantidad: num(punto.cantidad),
  monto: numOrNull(punto.monto),
  unidades: numOrNull(punto.unidades),
});

const etiquetaRanking = <T extends { unidades: number | null; monto: number | null }>(
  fila: T,
): T => ({ ...fila, unidades: numOrNull(fila.unidades), monto: numOrNull(fila.monto) });

/**
 * Servicio de reportes y dashboard de CU28.
 *
 * Corresponde 1:1 con `ReportesService` del backend
 * (`app/modules/reportes/services/reportes_service.py`):
 *
 *   consultar_dashboard / consultar_ventas / consultar_productos /
 *   consultar_inventario / consultar_reservas / consultar_devoluciones /
 *   consultar_pagos / consultar_compras_proveedores /
 *   consultar_clientes_carritos / consultar_auditoria / generar_reporte
 *
 * Solo LEE y exporta: no recalcula métricas de negocio (el backend es la
 * autoridad). Los `Decimal` se normalizan a `number` únicamente para
 * presentación. Usa el HttpClient + interceptor JWT existentes.
 */
@Injectable({ providedIn: 'root' })
export class ReportesService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** GET /reportes/dashboard. */
  consultarDashboard(
    filtros: ReportesFiltros = {},
  ): Observable<DashboardResponse> {
    return this.http
      .get<DashboardResponse>(`${this.apiUrl}/reportes/dashboard`, {
        params: this.params(filtros, true),
      })
      .pipe(
        map((r) => ({
          ...r,
          kpis: {
            ventas_completadas: num(r.kpis.ventas_completadas),
            total_vendido: num(r.kpis.total_vendido),
            unidades_vendidas: num(r.kpis.unidades_vendidas),
            ticket_promedio: num(r.kpis.ticket_promedio),
            reservas_total: num(r.kpis.reservas_total),
            devoluciones_completadas: num(r.kpis.devoluciones_completadas),
            unidades_devueltas: num(r.kpis.unidades_devueltas),
            stock_disponible_total: num(r.kpis.stock_disponible_total),
          },
          ventas_evolucion: (r.ventas_evolucion ?? []).map(serie),
          ventas_por_canal: (r.ventas_por_canal ?? []).map((c) => ({
            ...c,
            cantidad_ventas: num(c.cantidad_ventas),
            monto: num(c.monto),
            unidades: num(c.unidades),
          })),
          top_productos: (r.top_productos ?? []).map((p) => ({
            ...p,
            unidades: num(p.unidades),
            monto: num(p.monto),
          })),
          resumen_reservas: {
            total: num(r.resumen_reservas.total),
            por_estado: r.resumen_reservas.por_estado ?? [],
          },
          resumen_devoluciones: {
            ...r.resumen_devoluciones,
            total: num(r.resumen_devoluciones.total),
            completadas: num(r.resumen_devoluciones.completadas),
            unidades_devueltas: num(r.resumen_devoluciones.unidades_devueltas),
            valor_referencial: num(r.resumen_devoluciones.valor_referencial),
            por_estado: r.resumen_devoluciones.por_estado ?? [],
          },
          resumen_inventario: {
            stock_actual_total: num(r.resumen_inventario.stock_actual_total),
            stock_reservado_total: num(
              r.resumen_inventario.stock_reservado_total,
            ),
            stock_disponible_total: num(
              r.resumen_inventario.stock_disponible_total,
            ),
            variantes_agotadas: num(r.resumen_inventario.variantes_agotadas),
            variantes_stock_bajo: num(r.resumen_inventario.variantes_stock_bajo),
          },
          comparativo_sucursales: (r.comparativo_sucursales ?? []).map((s) => ({
            ...s,
            ventas: num(s.ventas),
            monto_vendido: num(s.monto_vendido),
            unidades: num(s.unidades),
            ticket_promedio: num(s.ticket_promedio),
            reservas: num(s.reservas),
            devoluciones: num(s.devoluciones),
          })),
        })),
      );
  }

  /** GET /reportes/ventas (KPIs + desgloses + evolución + tabla paginada). */
  consultarVentas(
    filtros: ReportesFiltros = {},
  ): Observable<ReporteVentasResponse> {
    return this.http
      .get<ReporteVentasResponse>(`${this.apiUrl}/reportes/ventas`, {
        params: this.params(filtros, true),
      })
      .pipe(
        map((r) => ({
          ...r,
          resumen: nums(r.resumen, [
            'ventas_completadas',
            'monto_total',
            'unidades_vendidas',
            'ticket_promedio',
          ]),
          ventas_por_estado: lista(r.ventas_por_estado, ['cantidad', 'monto']),
          ventas_por_canal: lista(r.ventas_por_canal, [
            'cantidad',
            'monto',
            'unidades',
          ]),
          ventas_por_sucursal: lista(r.ventas_por_sucursal, [
            'cantidad',
            'monto',
            'unidades',
            'ticket_promedio',
          ]),
          ventas_por_empleado: lista(r.ventas_por_empleado, [
            'cantidad',
            'monto',
          ]),
          evolucion: (r.evolucion ?? []).map(serie),
          items: lista(r.items, ['cantidad_unidades', 'total']),
          paginacion: this.paginacion(r.paginacion),
        })),
      );
  }

  /** GET /reportes/productos (rankings de producto, variante y etiqueta). */
  consultarProductos(
    filtros: ReportesFiltros = {},
  ): Observable<ReporteProductosResponse> {
    return this.http
      .get<ReporteProductosResponse>(`${this.apiUrl}/reportes/productos`, {
        params: this.params(filtros, true),
      })
      .pipe(
        map((r) => ({
          ...r,
          top_productos_por_unidades: lista(r.top_productos_por_unidades, [
            'unidades',
            'monto',
          ]),
          top_productos_por_monto: lista(r.top_productos_por_monto, [
            'unidades',
            'monto',
          ]),
          variantes_mas_vendidas: lista(r.variantes_mas_vendidas, [
            'unidades',
            'monto',
          ]),
          ventas_por_categoria: ranking(r.ventas_por_categoria),
          tallas_mas_vendidas: ranking(r.tallas_mas_vendidas),
          colores_mas_vendidos: ranking(r.colores_mas_vendidos),
          ventas_por_temporada: ranking(r.ventas_por_temporada),
          ventas_por_coleccion: ranking(r.ventas_por_coleccion),
        })),
      );
  }

  /** GET /reportes/inventario (umbral_stock_bajo + movimientos + tabla). */
  consultarInventario(
    filtros: ReportesFiltros = {},
  ): Observable<ReporteInventarioResponse> {
    return this.http
      .get<ReporteInventarioResponse>(`${this.apiUrl}/reportes/inventario`, {
        params: this.params(filtros, false),
      })
      .pipe(
        map((r) => ({
          ...r,
          resumen: nums(r.resumen, [
            'stock_actual_total',
            'stock_reservado_total',
            'stock_disponible_total',
            'variantes_agotadas',
            'variantes_stock_bajo',
            'umbral_stock_bajo',
          ]),
          movimientos_por_tipo: lista(r.movimientos_por_tipo, [
            'cantidad_movimientos',
            'unidades',
          ]),
          items: lista(r.items, [
            'stock_actual',
            'stock_reservado',
            'stock_disponible',
          ]),
          paginacion: this.paginacion(r.paginacion),
        })),
      );
  }

  /** GET /reportes/reservas (tasa de conversión ya calculada en backend). */
  consultarReservas(
    filtros: ReportesFiltros = {},
  ): Observable<ReporteReservasResponse> {
    return this.http
      .get<ReporteReservasResponse>(`${this.apiUrl}/reportes/reservas`, {
        params: this.params(filtros, true),
      })
      .pipe(
        map((r) => ({
          ...r,
          resumen: nums(r.resumen, [
            'total_reservas',
            'cantidad_total_unidades',
            'reservas_atendidas',
            'reservas_convertidas_en_venta',
            'tasa_conversion',
          ]),
          reservas_por_estado: lista<ReservaEstado>(r.reservas_por_estado, [
            'cantidad',
            'unidades',
          ]),
          reservas_por_sucursal: lista(r.reservas_por_sucursal, [
            'cantidad',
            'unidades',
          ]),
          evolucion: (r.evolucion ?? []).map(serie),
        })),
      );
  }

  /** GET /reportes/devoluciones (valor REFERENCIAL, nunca reembolso). */
  consultarDevoluciones(
    filtros: ReportesFiltros = {},
  ): Observable<ReporteDevolucionesResponse> {
    return this.http
      .get<ReporteDevolucionesResponse>(
        `${this.apiUrl}/reportes/devoluciones`,
        { params: this.params(filtros, true) },
      )
      .pipe(
        map((r) => ({
          ...r,
          resumen: nums(r.resumen, [
            'total_devoluciones',
            'completadas',
            'unidades_devueltas',
            'valor_referencial',
          ]),
          devoluciones_por_estado: lista<DevolucionEstado>(
            r.devoluciones_por_estado,
            ['cantidad', 'unidades', 'valor_referencial'],
          ),
          devoluciones_por_sucursal: lista(r.devoluciones_por_sucursal, [
            'cantidad',
            'unidades',
          ]),
          evolucion: (r.evolucion ?? []).map(serie),
          productos_mas_devueltos: lista(r.productos_mas_devueltos, [
            'unidades',
            'valor_referencial',
          ]),
          motivos_mas_frecuentes: lista(r.motivos_mas_frecuentes, [
            'cantidad_devoluciones',
            'unidades',
          ]),
        })),
      );
  }

  /** GET /reportes/pagos (TRANSACCIONES de pago, no ventas). */
  consultarPagos(
    filtros: ReportesFiltros = {},
  ): Observable<ReportePagosResponse> {
    return this.http
      .get<ReportePagosResponse>(`${this.apiUrl}/reportes/pagos`, {
        params: this.params(filtros, true),
      })
      .pipe(
        map((r) => ({
          ...r,
          resumen: nums(r.resumen, [
            'cantidad_pagos',
            'monto_total_procesado',
            'monto_aprobado',
          ]),
          pagos_por_estado: lista<PagoEstado>(r.pagos_por_estado, [
            'cantidad',
            'monto',
          ]),
          pagos_por_metodo: lista<PagoMetodo>(r.pagos_por_metodo, [
            'cantidad',
            'monto',
          ]),
          pagos_por_pasarela: lista<PagoPasarela>(r.pagos_por_pasarela, [
            'cantidad',
            'monto',
          ]),
          evolucion: (r.evolucion ?? []).map(serie),
        })),
      );
  }

  /** GET /reportes/compras-proveedores (sin rankings subjetivos). */
  consultarComprasProveedores(
    filtros: ReportesFiltros = {},
  ): Observable<ReporteComprasResponse> {
    return this.http
      .get<ReporteComprasResponse>(
        `${this.apiUrl}/reportes/compras-proveedores`,
        { params: this.params(filtros, false) },
      )
      .pipe(
        map((r) => ({
          ...r,
          resumen: nums(r.resumen, [
            'total_ordenes',
            'unidades_ordenadas',
            'valor_total_ordenes',
            'valor_ordenes_recibidas',
          ]),
          ordenes_por_estado: lista(r.ordenes_por_estado, ['cantidad', 'valor']),
          ordenes_por_proveedor: lista(r.ordenes_por_proveedor, [
            'cantidad_ordenes',
            'unidades_ordenadas',
            'valor_ordenes',
            'ordenes_recibidas',
            'ordenes_canceladas',
          ]),
          ordenes_por_sucursal: lista(r.ordenes_por_sucursal, [
            'cantidad',
            'valor',
          ]),
          productos_abastecidos: lista(r.productos_abastecidos, [
            'unidades',
            'valor',
          ]),
        })),
      );
  }

  /** GET /reportes/clientes-carritos (PII minimizada). */
  consultarClientesCarritos(
    filtros: ReportesFiltros = {},
  ): Observable<ReporteClientesCarritosResponse> {
    return this.http
      .get<ReporteClientesCarritosResponse>(
        `${this.apiUrl}/reportes/clientes-carritos`,
        { params: this.params(filtros, false) },
      )
      .pipe(
        map((r) => ({
          ...r,
          resumen_clientes: nums(r.resumen_clientes, [
            'clientes_compradores',
            'clientes_recurrentes',
            'compras_totales',
            'unidades_totales',
            'monto_total',
          ]),
          compras_por_cliente: lista(r.compras_por_cliente, [
            'compras',
            'unidades',
            'monto',
          ]),
          resumen_carritos: nums(r.resumen_carritos, [
            'total_carritos',
            'carritos_convertidos',
            'tasa_conversion_carrito',
          ]),
        })),
      );
  }

  /** GET /reportes/auditoria (solo ADMINISTRADOR; el backend responde 403). */
  consultarAuditoria(
    filtros: ReportesFiltros = {},
  ): Observable<ReporteAuditoriaResponse> {
    return this.http
      .get<ReporteAuditoriaResponse>(`${this.apiUrl}/reportes/auditoria`, {
        params: this.params(filtros, false),
      })
      .pipe(
        map((r) => ({
          ...r,
          total_eventos: num(r.total_eventos),
          eventos_por_accion: r.eventos_por_accion ?? [],
          eventos_por_entidad: r.eventos_por_entidad ?? [],
          eventos_por_usuario: r.eventos_por_usuario ?? [],
          evolucion: (r.evolucion ?? []).map(serie),
          paginacion: this.paginacion(r.paginacion),
        })),
      );
  }

  /**
   * GET /reportes/exportar/{tipo} con los MISMOS filtros del reporte activo.
   *
   * El archivo lo genera el backend (PDF/XLSX/CSV): el frontend solo lo
   * descarga. Si supera las 10.000 filas el backend responde 422.
   */
  exportarReporte(
    tipo: TipoReporte,
    formato: FormatoExportacion,
    filtros: ReportesFiltros = {},
  ): Observable<ReporteExportado> {
    // Los reportes sin series temporales no aceptan `agrupacion`.
    const conAgrupacion = !SIN_AGRUPACION.includes(tipo);
    const params = this.params(filtros, conAgrupacion)
      .set('formato', formato)
      .delete('pagina')
      .delete('tamano_pagina');

    return this.http
      .get(`${this.apiUrl}/reportes/exportar/${tipo}`, {
        params,
        observe: 'response',
        responseType: 'blob',
      })
      .pipe(
        map((respuesta: HttpResponse<Blob>) => ({
          blob: respuesta.body ?? new Blob(),
          nombre: nombreDesdeDisposicion(
            respuesta.headers.get('Content-Disposition'),
            tipo,
            formato,
          ),
        })),
      );
  }

  /** Query params inmutables: solo se envía lo definido. */
  private params(
    filtros: ReportesFiltros,
    conAgrupacion: boolean,
  ): HttpParams {
    let params = new HttpParams();

    if (filtros.fecha_desde) {
      params = params.set('fecha_desde', filtros.fecha_desde);
    }
    if (filtros.fecha_hasta) {
      params = params.set('fecha_hasta', filtros.fecha_hasta);
    }
    if (filtros.sucursal_id !== undefined && filtros.sucursal_id !== null) {
      params = params.set('sucursal_id', String(filtros.sucursal_id));
    }
    if (conAgrupacion && filtros.agrupacion) {
      params = params.set('agrupacion', filtros.agrupacion);
    }
    if (filtros.top !== undefined) {
      params = params.set('top', String(filtros.top));
    }
    if (filtros.umbral_stock_bajo !== undefined) {
      params = params.set(
        'umbral_stock_bajo',
        String(filtros.umbral_stock_bajo),
      );
    }
    if (filtros.pagina !== undefined) {
      params = params.set('pagina', String(filtros.pagina));
    }
    if (filtros.tamano_pagina !== undefined) {
      params = params.set('tamano_pagina', String(filtros.tamano_pagina));
    }

    return params;
  }

  private paginacion(p: PaginacionReporte): PaginacionReporte {
    return {
      pagina: num(p.pagina),
      tamano_pagina: num(p.tamano_pagina),
      total_registros: num(p.total_registros),
      total_paginas: num(p.total_paginas),
    };
  }
}

/** Reportes que NO aceptan `agrupacion` (no manejan series temporales). */
const SIN_AGRUPACION: readonly TipoReporte[] = [
  'INVENTARIO',
  'COMPRAS_PROVEEDORES',
  'CLIENTES_CARRITOS',
];

/** Nombre del archivo: usa el `Content-Disposition` real del backend. */
function nombreDesdeDisposicion(
  disposicion: string | null,
  tipo: string,
  formato: FormatoExportacion,
): string {
  const coincidencia = /filename="?([^";]+)"?/i.exec(disposicion ?? '');
  if (coincidencia?.[1]) {
    return coincidencia[1];
  }
  const extension = formato.toLowerCase();
  return `${tipo.toLowerCase()}_vanter-men.${extension}`;
}

/** Convierte a `number` las claves numéricas indicadas (no toca el resto). */
function nums<T extends object>(fila: T, claves: readonly string[]): T {
  const copia: Record<string, unknown> = { ...(fila as Record<string, unknown>) };
  for (const clave of claves) {
    copia[clave] = num(copia[clave] as number | string | null | undefined);
  }
  return copia as T;
}

function lista<T extends object>(filas: T[], claves: readonly string[]): T[] {
  return (filas ?? []).map((fila) => nums(fila, claves));
}

/** Ranking por etiqueta: solo normaliza `unidades` y `monto`. */
function ranking<T extends object>(filas: T[]): T[] {
  return lista(filas, ['unidades', 'monto']);
}
