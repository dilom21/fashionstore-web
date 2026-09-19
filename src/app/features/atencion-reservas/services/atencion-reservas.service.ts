import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  AtencionReservaDetalle,
  AtencionReservaFiltros,
  AtencionReservaListaResponse,
  ESTADO_ATENDIBLE,
  PrepararVentaRequest,
  PrepararVentaResponse,
} from '../models/atencion-reserva.model';

/**
 * Servicio de CU18 - Atender reserva de prendas.
 *
 * Endpoints reales (app/modules/reservas/api/atencion_router.py):
 * - GET    /atencion-reservas
 * - GET    /atencion-reservas/{reserva_id}
 * - POST   /atencion-reservas/{reserva_id}/preparar-venta
 * - POST   /atencion-reservas/{reserva_id}/finalizar-sin-compra
 *
 * La sucursal la deduce el backend del empleado autenticado: aquí nunca se
 * envía. El JWT lo adjunta el authInterceptor.
 */
@Injectable({ providedIn: 'root' })
export class AtencionReservasService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  private get baseUrl(): string {
    return `${this.apiUrl}/atencion-reservas`;
  }

  /** GET /atencion-reservas (paginado: items/total/limit/offset). */
  listarReservas(
    filtros: AtencionReservaFiltros = {},
  ): Observable<AtencionReservaListaResponse> {
    return this.http.get<AtencionReservaListaResponse>(this.baseUrl, {
      params: this.construirParams(filtros),
    });
  }

  /** GET /atencion-reservas/{reserva_id} (409 si no está CONFIRMADA). */
  obtenerReserva(reservaId: number): Observable<AtencionReservaDetalle> {
    return this.http.get<AtencionReservaDetalle>(
      `${this.baseUrl}/${reservaId}`,
    );
  }

  /**
   * POST /atencion-reservas/{reserva_id}/preparar-venta.
   *
   * Solo valida/normaliza la selección: NO crea venta, NO cambia la reserva ni
   * el inventario (la respuesta lo confirma con venta_registrada=false y
   * reserva_modificada=false).
   */
  prepararVenta(
    reservaId: number,
    payload: PrepararVentaRequest,
  ): Observable<PrepararVentaResponse> {
    return this.http.post<PrepararVentaResponse>(
      `${this.baseUrl}/${reservaId}/preparar-venta`,
      payload,
    );
  }

  /**
   * POST /atencion-reservas/{reserva_id}/finalizar-sin-compra
   * (CONFIRMADA -> ATENDIDA liberando lo reservado en el backend).
   */
  finalizarSinCompra(
    reservaId: number,
    observacion: string | null = null,
  ): Observable<AtencionReservaDetalle> {
    return this.http.post<AtencionReservaDetalle>(
      `${this.baseUrl}/${reservaId}/finalizar-sin-compra`,
      { observacion },
    );
  }

  /** true si el backend admite la atención de una reserva en ese estado. */
  esAtendible(estado: string): boolean {
    return (estado ?? '').trim().toUpperCase() === ESTADO_ATENDIBLE;
  }

  /** Solo se envían los filtros con valor. */
  private construirParams(filtros: AtencionReservaFiltros): HttpParams {
    let params = new HttpParams();

    const buscar = filtros.buscar?.trim();
    if (buscar) {
      params = params.set('buscar', buscar);
    }
    // Solo el ADMINISTRADOR elige sucursal; el backend limita al resto.
    if (filtros.sucursal_id !== undefined && filtros.sucursal_id !== null) {
      params = params.set('sucursal_id', filtros.sucursal_id.toString());
    }
    if (filtros.fecha_desde) {
      params = params.set('fecha_desde', filtros.fecha_desde);
    }
    if (filtros.fecha_hasta) {
      params = params.set('fecha_hasta', filtros.fecha_hasta);
    }
    if (filtros.limit !== undefined && filtros.limit !== null) {
      params = params.set('limit', filtros.limit.toString());
    }
    if (filtros.offset !== undefined && filtros.offset !== null) {
      params = params.set('offset', filtros.offset.toString());
    }

    return params;
  }
}
