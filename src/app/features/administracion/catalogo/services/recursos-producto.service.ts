import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import {
  RecursoProducto,
  RecursoProductoCreatePayload,
  RecursoProductoEstadoPayload,
  RecursoProductoListarFiltros,
  RecursoProductoUpdatePayload,
} from '../models/recurso-producto.model';

/**
 * Servicio de Recursos de producto (CU07).
 *
 * Endpoints reales del backend FastAPI:
 * GET   /productos/{producto_id}/recursos
 * POST  /productos/{producto_id}/recursos
 * PATCH /recursos-producto/{recurso_id}
 * PATCH /recursos-producto/{recurso_id}/estado
 * PATCH /recursos-producto/{recurso_id}/principal   (sin cuerpo)
 *
 * No existe upload/storage: el recurso se administra mediante URL.
 *
 * El JWT se adjunta automáticamente mediante el interceptor global.
 */
@Injectable({ providedIn: 'root' })
export class RecursosProductoService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** GET /productos/{producto_id}/recursos. */
  listarRecursos(
    productoId: number,
    filtros: RecursoProductoListarFiltros = {},
  ): Observable<RecursoProducto[]> {
    let params = new HttpParams();
    if (filtros.estado !== undefined && filtros.estado !== null) {
      params = params.set('estado', String(filtros.estado));
    }
    return this.http.get<RecursoProducto[]>(
      `${this.apiUrl}/productos/${productoId}/recursos`,
      { params },
    );
  }

  /** POST /productos/{producto_id}/recursos. */
  crearRecurso(
    productoId: number,
    payload: RecursoProductoCreatePayload,
  ): Observable<RecursoProducto> {
    return this.http.post<RecursoProducto>(
      `${this.apiUrl}/productos/${productoId}/recursos`,
      payload,
    );
  }

  /** PATCH /recursos-producto/{recurso_id}. */
  actualizarRecurso(
    recursoId: number,
    payload: RecursoProductoUpdatePayload,
  ): Observable<RecursoProducto> {
    return this.http.patch<RecursoProducto>(
      `${this.apiUrl}/recursos-producto/${recursoId}`,
      payload,
    );
  }

  /** PATCH /recursos-producto/{recurso_id}/estado. */
  cambiarEstadoRecurso(
    recursoId: number,
    estado: boolean,
  ): Observable<RecursoProducto> {
    const payload: RecursoProductoEstadoPayload = { estado };
    return this.http.patch<RecursoProducto>(
      `${this.apiUrl}/recursos-producto/${recursoId}/estado`,
      payload,
    );
  }

  /** PATCH /recursos-producto/{recurso_id}/principal (sin cuerpo). */
  marcarPrincipal(recursoId: number): Observable<RecursoProducto> {
    return this.http.patch<RecursoProducto>(
      `${this.apiUrl}/recursos-producto/${recursoId}/principal`,
      {},
    );
  }
}
