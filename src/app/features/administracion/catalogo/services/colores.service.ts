import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import {
  Color,
  ColorCreatePayload,
  ColorEstadoPayload,
  ColorListarFiltros,
  ColorUpdatePayload,
} from '../models/color.model';

/**
 * Servicio de Colores (CU07).
 *
 * Endpoints reales del backend FastAPI:
 * GET /colores, GET /colores/{id}, POST /colores, PATCH /colores/{id},
 * PATCH /colores/{id}/estado.
 *
 * El JWT se adjunta automáticamente mediante el interceptor global.
 */
@Injectable({ providedIn: 'root' })
export class ColoresService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** GET /colores con filtros buscar / estado. */
  listarColores(filtros: ColorListarFiltros = {}): Observable<Color[]> {
    let params = new HttpParams();

    const buscar = filtros.buscar?.trim();
    if (buscar) {
      params = params.set('buscar', buscar);
    }
    if (filtros.estado !== undefined && filtros.estado !== null) {
      params = params.set('estado', String(filtros.estado));
    }

    return this.http.get<Color[]>(`${this.apiUrl}/colores`, { params });
  }

  /** GET /colores/{color_id}. */
  obtenerColor(colorId: number): Observable<Color> {
    return this.http.get<Color>(`${this.apiUrl}/colores/${colorId}`);
  }

  /** POST /colores. */
  crearColor(payload: ColorCreatePayload): Observable<Color> {
    return this.http.post<Color>(`${this.apiUrl}/colores`, payload);
  }

  /** PATCH /colores/{color_id} (solo campos modificados). */
  actualizarColor(
    colorId: number,
    payload: ColorUpdatePayload,
  ): Observable<Color> {
    return this.http.patch<Color>(
      `${this.apiUrl}/colores/${colorId}`,
      payload,
    );
  }

  /** PATCH /colores/{color_id}/estado. */
  cambiarEstadoColor(colorId: number, estado: boolean): Observable<Color> {
    const payload: ColorEstadoPayload = { estado };
    return this.http.patch<Color>(
      `${this.apiUrl}/colores/${colorId}/estado`,
      payload,
    );
  }
}
