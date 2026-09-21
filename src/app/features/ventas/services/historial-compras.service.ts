import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, throwError } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  HistorialCompraDetalle,
  HistorialCompraItem,
  HistorialCompraResumen,
  HistorialComprasFiltros,
  HistorialComprasResponse,
} from '../models/historial-compras.model';

/**
 * Servicio de historial de compras del cliente (CU24).
 *
 * Única responsabilidad: consultar el historial del CLIENTE autenticado.
 *
 *   obtenerHistorial(filtros) -> GET /ventas/historial
 *   obtenerDetalle(ventaId)   -> GET /ventas/historial/{venta_id}
 *
 * El backend identifica al cliente desde el JWT (`get_current_cliente`): el
 * frontend NUNCA envía `cliente_id` ni ningún identificador de cliente.
 *
 * CU24 es una CONSULTA: no modifica ventas, no registra pagos, no genera
 * comprobantes ni PDF, no hace polling y no reintenta automáticamente. Usa el
 * HttpClient y el interceptor de autenticación existentes (sin token manager
 * propio).
 */
@Injectable({ providedIn: 'root' })
export class HistorialComprasService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** GET /ventas/historial (paginado, solo compras del cliente del JWT). */
  obtenerHistorial(
    filtros: HistorialComprasFiltros = {},
  ): Observable<HistorialComprasResponse> {
    return this.http
      .get<HistorialComprasResponse>(`${this.apiUrl}/ventas/historial`, {
        params: this.construirParams(filtros),
      })
      .pipe(map((respuesta) => this.normalizarRespuesta(respuesta)));
  }

  /** GET /ventas/historial/{venta_id} (detalle de una compra propia). */
  obtenerDetalle(ventaId: number): Observable<HistorialCompraDetalle> {
    const id = Number(ventaId);
    if (!Number.isInteger(id) || id <= 0) {
      return throwError(
        () => new Error('El identificador de la venta no es válido.'),
      );
    }
    return this.http
      .get<HistorialCompraDetalle>(
        `${this.apiUrl}/ventas/historial/${id}`,
      )
      .pipe(map((detalle) => this.normalizarDetalle(detalle)));
  }

  /**
   * Construye los query params SOLO con filtros definidos.
   *
   * Nunca se envían cadenas vacías ni `cliente_id`: el backend aplica sus
   * valores por defecto (`pagina=1`, `tamano_pagina=20`).
   */
  private construirParams(filtros: HistorialComprasFiltros): HttpParams {
    let params = new HttpParams();

    if (filtros.estado) {
      params = params.set('estado', filtros.estado);
    }
    if (filtros.canal) {
      params = params.set('canal', filtros.canal);
    }
    if (filtros.fecha_desde) {
      params = params.set('fecha_desde', filtros.fecha_desde);
    }
    if (filtros.fecha_hasta) {
      params = params.set('fecha_hasta', filtros.fecha_hasta);
    }
    if (filtros.pagina !== undefined) {
      params = params.set('pagina', String(filtros.pagina));
    }
    if (filtros.tamano_pagina !== undefined) {
      params = params.set('tamano_pagina', String(filtros.tamano_pagina));
    }

    return params;
  }

  /** Normaliza los `Decimal` del listado solo para presentación. */
  private normalizarRespuesta(
    respuesta: HistorialComprasResponse,
  ): HistorialComprasResponse {
    return {
      ...respuesta,
      pagina: Number(respuesta.pagina),
      tamano_pagina: Number(respuesta.tamano_pagina),
      total_registros: Number(respuesta.total_registros),
      total_paginas: Number(respuesta.total_paginas),
      items: (respuesta.items ?? []).map((item) =>
        this.normalizarResumen(item),
      ),
    };
  }

  private normalizarResumen(
    item: HistorialCompraResumen,
  ): HistorialCompraResumen {
    return {
      ...item,
      total: Number(item.total),
      cantidad_lineas: Number(item.cantidad_lineas),
      cantidad_total_unidades: Number(item.cantidad_total_unidades),
    };
  }

  /** Normaliza los `Decimal` del detalle; el total no se recalcula. */
  private normalizarDetalle(
    detalle: HistorialCompraDetalle,
  ): HistorialCompraDetalle {
    return {
      ...detalle,
      total: Number(detalle.total),
      cantidad_total_unidades: Number(detalle.cantidad_total_unidades),
      pago:
        detalle.pago === null
          ? null
          : { ...detalle.pago, monto: Number(detalle.pago.monto) },
      items: (detalle.items ?? []).map((item) => this.normalizarItem(item)),
    };
  }

  private normalizarItem(item: HistorialCompraItem): HistorialCompraItem {
    return {
      ...item,
      cantidad: Number(item.cantidad),
      precio_unitario: Number(item.precio_unitario),
      subtotal_linea: Number(item.subtotal_linea),
    };
  }
}
