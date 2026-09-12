import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import {
  DetalleOrdenCompra,
  DetalleOrdenCompraInput,
  DetallesOrdenCompra,
  DetallesOrdenCompraUpdatePayload,
  OrdenCompra,
  OrdenCompraCreatePayload,
  OrdenCompraListarFiltros,
  OrdenCompraUpdatePayload,
} from '../models/orden-compra.model';

/** Detalle crudo: `costo_unitario` (Decimal) puede llegar como número o string. */
interface DetalleOrdenCompraRaw {
  id: number;
  variante_producto_id: number;
  temporada_id: number;
  cantidad: number;
  costo_unitario: unknown;
  sku: string;
  producto_id: number;
  producto_nombre: string;
  temporada_nombre: string;
}

/** Respuesta cruda de GET/PUT /ordenes-compra/{id}/detalles. */
interface DetallesOrdenCompraRaw {
  orden_compra_id: number;
  total: number;
  detalles: DetalleOrdenCompraRaw[];
}

/**
 * Servicio de Órdenes de compra (CU12).
 *
 * Consume el contrato real del backend con prefijo `/ordenes-compra`. El JWT se
 * adjunta automáticamente mediante el interceptor global.
 *
 * El PUT de detalles reemplaza el conjunto COMPLETO (no hay request por fila),
 * es atómico e idempotente, deduplica por variante + temporada conservando la
 * última ocurrencia y acepta `[]` mientras la orden está en BORRADOR.
 *
 * La recepción (`POST /{id}/recibir`) dispara internamente
 * `sp_recibir_orden_compra`: Angular solo ejecuta el POST una vez y nunca
 * actualiza inventario ni crea movimientos.
 */
@Injectable({ providedIn: 'root' })
export class OrdenesCompraService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** GET /ordenes-compra (filtros: buscar, proveedor, sucursal, estado, fechas). */
  listarOrdenes(
    filtros: OrdenCompraListarFiltros = {},
  ): Observable<OrdenCompra[]> {
    let params = new HttpParams();

    const buscar = filtros.buscar?.trim();
    if (buscar) {
      params = params.set('buscar', buscar);
    }
    params = this.agregarNumero(params, 'proveedor_id', filtros.proveedor_id);
    params = this.agregarNumero(params, 'sucursal_id', filtros.sucursal_id);
    if (filtros.estado) {
      params = params.set('estado', filtros.estado);
    }
    if (filtros.fecha_desde) {
      params = params.set('fecha_desde', filtros.fecha_desde);
    }
    if (filtros.fecha_hasta) {
      params = params.set('fecha_hasta', filtros.fecha_hasta);
    }

    return this.http.get<OrdenCompra[]>(`${this.apiUrl}/ordenes-compra`, {
      params,
    });
  }

  /** GET /ordenes-compra/{orden_id}. */
  obtenerOrden(ordenId: number): Observable<OrdenCompra> {
    return this.http.get<OrdenCompra>(
      `${this.apiUrl}/ordenes-compra/${ordenId}`,
    );
  }

  /** POST /ordenes-compra (siempre nace en BORRADOR). */
  crearOrden(payload: OrdenCompraCreatePayload): Observable<OrdenCompra> {
    return this.http.post<OrdenCompra>(
      `${this.apiUrl}/ordenes-compra`,
      payload,
    );
  }

  /** PATCH /ordenes-compra/{orden_id} (solo campos modificados de cabecera). */
  actualizarOrden(
    ordenId: number,
    payload: OrdenCompraUpdatePayload,
  ): Observable<OrdenCompra> {
    return this.http.patch<OrdenCompra>(
      `${this.apiUrl}/ordenes-compra/${ordenId}`,
      payload,
    );
  }

  /** GET /ordenes-compra/{orden_id}/detalles. */
  listarDetalles(ordenId: number): Observable<DetallesOrdenCompra> {
    return this.http
      .get<DetallesOrdenCompraRaw>(
        `${this.apiUrl}/ordenes-compra/${ordenId}/detalles`,
      )
      .pipe(map((respuesta) => this.normalizarDetalles(respuesta)));
  }

  /**
   * PUT /ordenes-compra/{orden_id}/detalles.
   *
   * Reemplaza el conjunto completo con un único request. Una lista vacía deja la
   * orden sin detalles (permitido mientras está en BORRADOR).
   */
  reemplazarDetalles(
    ordenId: number,
    detalles: DetalleOrdenCompraInput[],
  ): Observable<DetallesOrdenCompra> {
    const payload: DetallesOrdenCompraUpdatePayload = { detalles };
    return this.http
      .put<DetallesOrdenCompraRaw>(
        `${this.apiUrl}/ordenes-compra/${ordenId}/detalles`,
        payload,
      )
      .pipe(map((respuesta) => this.normalizarDetalles(respuesta)));
  }

  /** PATCH /ordenes-compra/{orden_id}/enviar (BORRADOR -> ENVIADA). */
  enviarOrden(ordenId: number): Observable<OrdenCompra> {
    return this.http.patch<OrdenCompra>(
      `${this.apiUrl}/ordenes-compra/${ordenId}/enviar`,
      {},
    );
  }

  /** PATCH /ordenes-compra/{orden_id}/cancelar (BORRADOR/ENVIADA -> CANCELADA). */
  cancelarOrden(ordenId: number): Observable<OrdenCompra> {
    return this.http.patch<OrdenCompra>(
      `${this.apiUrl}/ordenes-compra/${ordenId}/cancelar`,
      {},
    );
  }

  /**
   * POST /ordenes-compra/{orden_id}/recibir (ENVIADA/PARCIAL -> RECIBIDA).
   *
   * Operación crítica: debe ejecutarse una sola vez. La idempotencia y el
   * inventario los gestiona el backend (sp_recibir_orden_compra).
   */
  recibirOrden(ordenId: number): Observable<OrdenCompra> {
    return this.http.post<OrdenCompra>(
      `${this.apiUrl}/ordenes-compra/${ordenId}/recibir`,
      {},
    );
  }

  // ===== Utilidades =====

  private agregarNumero(
    params: HttpParams,
    clave: string,
    valor: number | undefined,
  ): HttpParams {
    if (valor === undefined || valor === null) {
      return params;
    }
    return params.set(clave, valor.toString());
  }

  private normalizarDetalles(
    respuesta: DetallesOrdenCompraRaw,
  ): DetallesOrdenCompra {
    return {
      orden_compra_id: respuesta.orden_compra_id,
      total: respuesta.total,
      detalles: respuesta.detalles.map(
        (detalle): DetalleOrdenCompra => ({
          id: detalle.id,
          variante_producto_id: detalle.variante_producto_id,
          temporada_id: detalle.temporada_id,
          cantidad: detalle.cantidad,
          costo_unitario: this.aNumero(detalle.costo_unitario),
          sku: detalle.sku,
          producto_id: detalle.producto_id,
          producto_nombre: detalle.producto_nombre,
          temporada_nombre: detalle.temporada_nombre,
        }),
      ),
    };
  }

  /** El backend serializa Decimal como número o string. */
  private aNumero(valor: unknown): number {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : 0;
  }
}
