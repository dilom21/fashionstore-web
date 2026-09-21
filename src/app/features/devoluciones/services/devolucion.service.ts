import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, throwError } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  DevolucionDetalle,
  DevolucionItem,
  DevolucionesFiltros,
  DevolucionesListaResponse,
  DevolucionResumen,
  DisponibilidadItem,
  DisponibilidadVenta,
  RegistrarDevolucionRequest,
} from '../models/devolucion.model';

/**
 * Servicio de devoluciones (CU25).
 *
 * Endpoints reales (módulo `devoluciones` del backend):
 *
 *   listarDevoluciones(filtros)           -> GET  /devoluciones
 *   obtenerDevolucion(id)                 -> GET  /devoluciones/{id}
 *   consultarDisponibilidadVenta(ventaId) -> GET  /devoluciones/ventas/{venta_id}/disponibilidad
 *   registrarDevolucion(payload)          -> POST /devoluciones (201 -> SOLICITADA)
 *   aprobarDevolucion(id)                 -> POST /devoluciones/{id}/aprobar
 *   rechazarDevolucion(id)                -> POST /devoluciones/{id}/rechazar
 *   procesarDevolucion(id)                -> POST /devoluciones/{id}/procesar
 *
 * CU25 es devolución física + reingreso a inventario: NO hay reembolso
 * financiero, no se toca `pago` ni el estado de la venta y no se llama a
 * Stripe. El único cambio de inventario ocurre al PROCESAR.
 *
 * Usa el HttpClient y el interceptor JWT existentes (sin token manager propio).
 */
@Injectable({ providedIn: 'root' })
export class DevolucionService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** GET /devoluciones (paginado, orden del backend: más reciente primero). */
  listarDevoluciones(
    filtros: DevolucionesFiltros = {},
  ): Observable<DevolucionesListaResponse> {
    return this.http
      .get<DevolucionesListaResponse>(`${this.apiUrl}/devoluciones`, {
        params: this.construirParams(filtros),
      })
      .pipe(map((respuesta) => this.normalizarLista(respuesta)));
  }

  /** GET /devoluciones/{devolucion_id}. */
  obtenerDevolucion(devolucionId: number): Observable<DevolucionDetalle> {
    const id = this.idValido(devolucionId);
    if (id === null) {
      return this.idInvalido();
    }
    return this.http
      .get<DevolucionDetalle>(`${this.apiUrl}/devoluciones/${id}`)
      .pipe(map((detalle) => this.normalizarDetalle(detalle)));
  }

  /** GET /devoluciones/ventas/{venta_id}/disponibilidad (venta COMPLETADA). */
  consultarDisponibilidadVenta(
    ventaId: number,
  ): Observable<DisponibilidadVenta> {
    const id = this.idValido(ventaId);
    if (id === null) {
      return this.idInvalido();
    }
    return this.http
      .get<DisponibilidadVenta>(
        `${this.apiUrl}/devoluciones/ventas/${id}/disponibilidad`,
      )
      .pipe(map((venta) => this.normalizarDisponibilidad(venta)));
  }

  /** POST /devoluciones: crea la solicitud (estado SOLICITADA). */
  registrarDevolucion(
    payload: RegistrarDevolucionRequest,
  ): Observable<DevolucionDetalle> {
    if (payload.items.length === 0) {
      return throwError(
        () => new Error('La devolución debe incluir al menos una prenda.'),
      );
    }
    return this.http
      .post<DevolucionDetalle>(`${this.apiUrl}/devoluciones`, payload)
      .pipe(map((detalle) => this.normalizarDetalle(detalle)));
  }

  /** POST /devoluciones/{id}/aprobar: SOLICITADA -> APROBADA. */
  aprobarDevolucion(devolucionId: number): Observable<DevolucionDetalle> {
    return this.accion(devolucionId, 'aprobar');
  }

  /** POST /devoluciones/{id}/rechazar: SOLICITADA -> RECHAZADA. */
  rechazarDevolucion(devolucionId: number): Observable<DevolucionDetalle> {
    return this.accion(devolucionId, 'rechazar');
  }

  /**
   * POST /devoluciones/{id}/procesar: APROBADA -> COMPLETADA.
   *
   * Es el único paso que repone stock (`sp_registrar_devolucion`) y registra el
   * movimiento DEVOLUCION.
   */
  procesarDevolucion(devolucionId: number): Observable<DevolucionDetalle> {
    return this.accion(devolucionId, 'procesar');
  }

  private accion(
    devolucionId: number,
    accion: 'aprobar' | 'rechazar' | 'procesar',
  ): Observable<DevolucionDetalle> {
    const id = this.idValido(devolucionId);
    if (id === null) {
      return this.idInvalido();
    }
    return this.http
      .post<DevolucionDetalle>(
        `${this.apiUrl}/devoluciones/${id}/${accion}`,
        {},
      )
      .pipe(map((detalle) => this.normalizarDetalle(detalle)));
  }

  /** Entero positivo requerido por los endpoints con id. */
  private idValido(valor: number): number | null {
    const id = Number(valor);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  private idInvalido(): Observable<never> {
    return throwError(
      () => new Error('El identificador indicado no es válido.'),
    );
  }

  /** Solo se envían filtros definidos (nunca cadenas vacías). */
  private construirParams(filtros: DevolucionesFiltros): HttpParams {
    let params = new HttpParams();

    if (filtros.estado) {
      params = params.set('estado', filtros.estado);
    }
    if (filtros.sucursal_id !== undefined && filtros.sucursal_id !== null) {
      params = params.set('sucursal_id', String(filtros.sucursal_id));
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

  /** Normaliza los metadatos y cantidades del listado (solo presentación). */
  private normalizarLista(
    respuesta: DevolucionesListaResponse,
  ): DevolucionesListaResponse {
    return {
      ...respuesta,
      pagina: Number(respuesta.pagina),
      tamano_pagina: Number(respuesta.tamano_pagina),
      total_registros: Number(respuesta.total_registros),
      total_paginas: Number(respuesta.total_paginas),
      items: (respuesta.items ?? []).map((item) => this.normalizarResumen(item)),
    };
  }

  private normalizarResumen(item: DevolucionResumen): DevolucionResumen {
    return {
      ...item,
      cantidad_lineas: Number(item.cantidad_lineas),
      cantidad_total_unidades: Number(item.cantidad_total_unidades),
    };
  }

  /** Normaliza la disponibilidad: `cantidad_disponible` es del backend. */
  private normalizarDisponibilidad(
    venta: DisponibilidadVenta,
  ): DisponibilidadVenta {
    return {
      ...venta,
      total: Number(venta.total),
      cantidad_total_unidades: Number(venta.cantidad_total_unidades),
      items: (venta.items ?? []).map((item) =>
        this.normalizarDisponibilidadItem(item),
      ),
    };
  }

  private normalizarDisponibilidadItem(
    item: DisponibilidadItem,
  ): DisponibilidadItem {
    return {
      ...item,
      cantidad_vendida: Number(item.cantidad_vendida),
      cantidad_comprometida: Number(item.cantidad_comprometida),
      cantidad_disponible: Number(item.cantidad_disponible),
      precio_unitario: Number(item.precio_unitario),
    };
  }

  /** Normaliza el detalle; los subtotales son referenciales (no reembolso). */
  private normalizarDetalle(detalle: DevolucionDetalle): DevolucionDetalle {
    return {
      ...detalle,
      cantidad_total_unidades: Number(detalle.cantidad_total_unidades),
      venta: { ...detalle.venta, total: Number(detalle.venta.total) },
      items: (detalle.items ?? []).map((item) => this.normalizarItem(item)),
    };
  }

  private normalizarItem(item: DevolucionItem): DevolucionItem {
    return {
      ...item,
      cantidad_vendida: Number(item.cantidad_vendida),
      cantidad_solicitada: Number(item.cantidad_solicitada),
      precio_unitario: Number(item.precio_unitario),
      subtotal_referencial: Number(item.subtotal_referencial),
    };
  }
}
