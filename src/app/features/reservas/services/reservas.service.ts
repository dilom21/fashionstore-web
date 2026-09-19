import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  CancelarReservaPayload,
  CrearReservaPayload,
  EstadoReserva,
  ReservaDetalle,
  ReservaListaResponse,
} from '../models/reserva.model';

/** Estados que el backend permite cancelar (autoridad real del backend). */
const ESTADOS_CANCELABLES = new Set<string>(['PENDIENTE', 'CONFIRMADA']);

/**
 * Servicio de reservas de prendas del CLIENTE (CU16).
 *
 * Centraliza el contrato real del backend:
 * - POST   /reservas                        -> ReservaDetalle
 * - GET    /reservas[?estado=...]           -> ReservaListaResponse
 * - GET    /reservas/{reserva_id}           -> ReservaDetalle
 * - PATCH  /reservas/{reserva_id}/cancelar  -> ReservaDetalle
 *
 * El cliente lo resuelve el backend desde el JWT: aquí NUNCA se envía
 * `cliente_id`. Tampoco se envían sucursal, prendas ni cantidades: la reserva
 * usa el carrito completo.
 */
@Injectable({ providedIn: 'root' })
export class ReservasService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** POST /reservas (crea la reserva a partir del carrito completo). */
  crearReserva(payload: CrearReservaPayload): Observable<ReservaDetalle> {
    return this.http.post<ReservaDetalle>(`${this.apiUrl}/reservas`, payload);
  }

  /** GET /reservas (reservas del cliente autenticado). */
  listarReservas(
    estado: EstadoReserva | null = null,
  ): Observable<ReservaListaResponse> {
    let params = new HttpParams();
    if (estado) {
      params = params.set('estado', estado);
    }
    return this.http.get<ReservaListaResponse>(`${this.apiUrl}/reservas`, {
      params,
    });
  }

  /** GET /reservas/{reserva_id}. */
  obtenerReserva(reservaId: number): Observable<ReservaDetalle> {
    return this.http.get<ReservaDetalle>(
      `${this.apiUrl}/reservas/${reservaId}`,
    );
  }

  /** PATCH /reservas/{reserva_id}/cancelar. */
  cancelarReserva(
    reservaId: number,
    observacion: string | null = null,
  ): Observable<ReservaDetalle> {
    const payload: CancelarReservaPayload = { observacion };
    return this.http.patch<ReservaDetalle>(
      `${this.apiUrl}/reservas/${reservaId}/cancelar`,
      payload,
    );
  }

  /**
   * true si la reserva admite cancelación. El backend sigue siendo la
   * autoridad: aquí solo se evita ofrecer una acción que siempre fallaría.
   */
  esCancelable(estado: string): boolean {
    return ESTADOS_CANCELABLES.has((estado ?? '').trim().toUpperCase());
  }
}
