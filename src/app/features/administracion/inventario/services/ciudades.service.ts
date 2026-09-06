import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import {
  Ciudad,
  CiudadCreatePayload,
  CiudadEstadoPayload,
  CiudadListarFiltros,
  CiudadUpdatePayload,
} from '../models/ciudad.model';

/**
 * Servicio de Ciudades (CU06).
 *
 * Consume únicamente los endpoints reales del backend FastAPI:
 * GET /ciudades, GET /ciudades/{id}, POST /ciudades,
 * PATCH /ciudades/{id} y PATCH /ciudades/{id}/estado.
 *
 * El JWT se adjunta automáticamente mediante el interceptor global.
 */
@Injectable({ providedIn: 'root' })
export class CiudadesService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** GET /ciudades (sin estado: el backend responde solo activas). */
  listarCiudadesActivas(): Observable<Ciudad[]> {
    return this.http.get<Ciudad[]>(`${this.apiUrl}/ciudades`);
  }

  /** GET /ciudades con filtros buscar / estado. */
  listarCiudades(filtros: CiudadListarFiltros = {}): Observable<Ciudad[]> {
    let params = new HttpParams();

    const buscar = filtros.buscar?.trim();
    if (buscar) {
      params = params.set('buscar', buscar);
    }
    if (filtros.estado !== undefined && filtros.estado !== null) {
      params = params.set('estado', String(filtros.estado));
    }

    return this.http.get<Ciudad[]>(`${this.apiUrl}/ciudades`, { params });
  }

  /** GET /ciudades/{ciudad_id}. */
  obtenerCiudad(ciudadId: number): Observable<Ciudad> {
    return this.http.get<Ciudad>(`${this.apiUrl}/ciudades/${ciudadId}`);
  }

  /** POST /ciudades. */
  crearCiudad(payload: CiudadCreatePayload): Observable<Ciudad> {
    return this.http.post<Ciudad>(`${this.apiUrl}/ciudades`, payload);
  }

  /** PATCH /ciudades/{ciudad_id} (solo campos modificados). */
  actualizarCiudad(ciudadId: number, payload: CiudadUpdatePayload): Observable<Ciudad> {
    return this.http.patch<Ciudad>(`${this.apiUrl}/ciudades/${ciudadId}`, payload);
  }

  /** PATCH /ciudades/{ciudad_id}/estado (habilitar/deshabilitar). */
  cambiarEstadoCiudad(ciudadId: number, estado: boolean): Observable<Ciudad> {
    const payload: CiudadEstadoPayload = { estado };
    return this.http.patch<Ciudad>(`${this.apiUrl}/ciudades/${ciudadId}/estado`, payload);
  }
}
