import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import {
  Temporada,
  TemporadaCreatePayload,
  TemporadaEstadoPayload,
  TemporadaListarFiltros,
  TemporadaUpdatePayload,
} from '../models/temporada.model';

/**
 * Servicio de Temporadas (CU08).
 *
 * Consume el contrato real del backend:
 * GET/POST /temporadas, GET/PATCH /temporadas/{id},
 * PATCH /temporadas/{id}/estado.
 *
 * Todos los endpoints requieren administrador. El JWT se adjunta
 * automáticamente mediante el interceptor global.
 */
@Injectable({ providedIn: 'root' })
export class TemporadasService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** GET /temporadas (filtros opcionales: buscar, estado). */
  listarTemporadas(
    filtros: TemporadaListarFiltros = {},
  ): Observable<Temporada[]> {
    let params = new HttpParams();

    const buscar = filtros.buscar?.trim();
    if (buscar) {
      params = params.set('buscar', buscar);
    }
    if (filtros.estado !== undefined && filtros.estado !== null) {
      params = params.set('estado', String(filtros.estado));
    }

    return this.http.get<Temporada[]>(`${this.apiUrl}/temporadas`, { params });
  }

  /** GET /temporadas/{temporada_id}. */
  obtenerTemporada(temporadaId: number): Observable<Temporada> {
    return this.http.get<Temporada>(`${this.apiUrl}/temporadas/${temporadaId}`);
  }

  /** POST /temporadas. */
  crearTemporada(payload: TemporadaCreatePayload): Observable<Temporada> {
    return this.http.post<Temporada>(`${this.apiUrl}/temporadas`, payload);
  }

  /** PATCH /temporadas/{temporada_id} (solo campos modificados). */
  actualizarTemporada(
    temporadaId: number,
    payload: TemporadaUpdatePayload,
  ): Observable<Temporada> {
    return this.http.patch<Temporada>(
      `${this.apiUrl}/temporadas/${temporadaId}`,
      payload,
    );
  }

  /** PATCH /temporadas/{temporada_id}/estado (habilitar/deshabilitar). */
  cambiarEstadoTemporada(
    temporadaId: number,
    estado: boolean,
  ): Observable<Temporada> {
    const payload: TemporadaEstadoPayload = { estado };
    return this.http.patch<Temporada>(
      `${this.apiUrl}/temporadas/${temporadaId}/estado`,
      payload,
    );
  }
}
