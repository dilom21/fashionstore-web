import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import {
  CancelarReservaSucursalPayload,
  EstadoReservaSucursal,
  ReservaSucursalDetalle,
  ReservaSucursalFiltros,
  ReservaSucursalListaResponse,
} from '../models/reserva-sucursal.model';

/** Estados sobre los que el backend permite cada transición (CU17). */
const ESTADOS_CONFIRMABLES = new Set<string>(['PENDIENTE']);
const ESTADOS_CANCELABLES = new Set<string>(['PENDIENTE', 'CONFIRMADA']);

/**
 * Servicio de CU17 - Gestionar reservas de sucursal.
 *
 * Endpoints reales (app/modules/reservas/api/gestion_router.py):
 * - GET    /reservas-sucursal
 * - GET    /reservas-sucursal/{reserva_id}
 * - PATCH  /reservas-sucursal/{reserva_id}/confirmar
 * - PATCH  /reservas-sucursal/{reserva_id}/cancelar
 *
 * El JWT lo adjunta el authInterceptor; el alcance por sucursal lo aplica el
 * backend (403 si el encargado pide otra sucursal).
 */
@Injectable({ providedIn: 'root' })
export class ReservasSucursalService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  private get baseUrl(): string {
    return `${this.apiUrl}/reservas-sucursal`;
  }

  /** GET /reservas-sucursal (paginado: items/total/limit/offset). */
  listarReservas(
    filtros: ReservaSucursalFiltros = {},
  ): Observable<ReservaSucursalListaResponse> {
    return this.http.get<ReservaSucursalListaResponse>(this.baseUrl, {
      params: this.construirParams(filtros),
    });
  }

  /** GET /reservas-sucursal/{reserva_id}. */
  obtenerReserva(reservaId: number): Observable<ReservaSucursalDetalle> {
    return this.http.get<ReservaSucursalDetalle>(
      `${this.baseUrl}/${reservaId}`,
    );
  }

  /** PATCH /reservas-sucursal/{reserva_id}/confirmar (PENDIENTE → CONFIRMADA). */
  confirmarReserva(reservaId: number): Observable<ReservaSucursalDetalle> {
    return this.http.patch<ReservaSucursalDetalle>(
      `${this.baseUrl}/${reservaId}/confirmar`,
      {},
    );
  }

  /** PATCH /reservas-sucursal/{reserva_id}/cancelar (PENDIENTE/CONFIRMADA → CANCELADA). */
  cancelarReserva(
    reservaId: number,
    observacion: string | null = null,
  ): Observable<ReservaSucursalDetalle> {
    const payload: CancelarReservaSucursalPayload = { observacion };
    return this.http.patch<ReservaSucursalDetalle>(
      `${this.baseUrl}/${reservaId}/cancelar`,
      payload,
    );
  }

  /**
   * Cuenta reservas de un estado concreto usando el `total` real del backend
   * (limit=1). Evita presentar estadísticas calculadas sobre una sola página.
   */
  contarReservas(
    filtros: ReservaSucursalFiltros = {},
  ): Observable<number> {
    return this.listarReservas({ ...filtros, limit: 1, offset: 0 }).pipe(
      map((respuesta) => respuesta.total),
    );
  }

  /** true si el backend permite confirmar desde ese estado. */
  esConfirmable(estado: string): boolean {
    return ESTADOS_CONFIRMABLES.has((estado ?? '').trim().toUpperCase());
  }

  /** true si el backend permite cancelar desde ese estado. */
  esCancelable(estado: string): boolean {
    return ESTADOS_CANCELABLES.has((estado ?? '').trim().toUpperCase());
  }

  /** Solo se envían al backend los filtros con valor. */
  private construirParams(filtros: ReservaSucursalFiltros): HttpParams {
    let params = new HttpParams();

    if (filtros.sucursal_id !== undefined && filtros.sucursal_id !== null) {
      params = params.set('sucursal_id', filtros.sucursal_id.toString());
    }
    if (filtros.estado) {
      params = params.set('estado', filtros.estado as EstadoReservaSucursal);
    }
    const buscar = filtros.buscar?.trim();
    if (buscar) {
      params = params.set('buscar', buscar);
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
