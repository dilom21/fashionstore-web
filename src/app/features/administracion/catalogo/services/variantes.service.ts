import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import {
  Variante,
  VarianteCreatePayload,
  VarianteEstadoPayload,
  VarianteListarFiltros,
  VarianteUpdatePayload,
} from '../models/variante.model';

/**
 * Servicio de Variantes de producto (CU07).
 *
 * Endpoints reales del backend FastAPI:
 * GET   /productos/{producto_id}/variantes
 * POST  /productos/{producto_id}/variantes
 * PATCH /variantes/{variante_id}
 * PATCH /variantes/{variante_id}/estado
 *
 * El JWT se adjunta automáticamente mediante el interceptor global.
 */
@Injectable({ providedIn: 'root' })
export class VariantesService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** GET /productos/{producto_id}/variantes. */
  listarVariantes(
    productoId: number,
    filtros: VarianteListarFiltros = {},
  ): Observable<Variante[]> {
    let params = new HttpParams();
    if (filtros.estado !== undefined && filtros.estado !== null) {
      params = params.set('estado', String(filtros.estado));
    }
    return this.http.get<Variante[]>(
      `${this.apiUrl}/productos/${productoId}/variantes`,
      { params },
    );
  }

  /** POST /productos/{producto_id}/variantes. */
  crearVariante(
    productoId: number,
    payload: VarianteCreatePayload,
  ): Observable<Variante> {
    return this.http.post<Variante>(
      `${this.apiUrl}/productos/${productoId}/variantes`,
      payload,
    );
  }

  /** PATCH /variantes/{variante_id} (solo campos modificados). */
  actualizarVariante(
    varianteId: number,
    payload: VarianteUpdatePayload,
  ): Observable<Variante> {
    return this.http.patch<Variante>(
      `${this.apiUrl}/variantes/${varianteId}`,
      payload,
    );
  }

  /** PATCH /variantes/{variante_id}/estado. */
  cambiarEstadoVariante(
    varianteId: number,
    estado: boolean,
  ): Observable<Variante> {
    const payload: VarianteEstadoPayload = { estado };
    return this.http.patch<Variante>(
      `${this.apiUrl}/variantes/${varianteId}/estado`,
      payload,
    );
  }
}
