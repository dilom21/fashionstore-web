import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import {
  Categoria,
  CategoriaCreatePayload,
  CategoriaEstadoPayload,
  CategoriaListarFiltros,
  CategoriaUpdatePayload,
} from '../models/categoria.model';

/**
 * Servicio de Categorías (CU07) con contrato mixto.
 *
 * - Contrato público existente: GET /categorias, GET /categorias/{id}
 *   (solo categorías activas).
 * - Contrato administrativo: GET /categorias/admin, GET /categorias/admin/{id},
 *   POST /categorias, PATCH /categorias/{id}, PATCH /categorias/{id}/estado.
 *
 * El JWT se adjunta automáticamente mediante el interceptor global.
 */
@Injectable({ providedIn: 'root' })
export class CategoriasService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  // ===== Contrato público (no romper) =====

  /** GET /categorias (solo activas). */
  listarCategoriasPublicas(): Observable<Categoria[]> {
    return this.http.get<Categoria[]>(`${this.apiUrl}/categorias`);
  }

  /** GET /categorias/{categoria_id} (solo activa). */
  obtenerCategoriaPublica(categoriaId: number): Observable<Categoria> {
    return this.http.get<Categoria>(
      `${this.apiUrl}/categorias/${categoriaId}`,
    );
  }

  // ===== Contrato administrativo (CU07) =====

  /** GET /categorias/admin (activas e inactivas según filtro). */
  listarCategoriasAdmin(
    filtros: CategoriaListarFiltros = {},
  ): Observable<Categoria[]> {
    let params = new HttpParams();

    const buscar = filtros.buscar?.trim();
    if (buscar) {
      params = params.set('buscar', buscar);
    }
    if (filtros.estado !== undefined && filtros.estado !== null) {
      params = params.set('estado', String(filtros.estado));
    }

    return this.http.get<Categoria[]>(`${this.apiUrl}/categorias/admin`, {
      params,
    });
  }

  /** GET /categorias/admin/{categoria_id}. */
  obtenerCategoriaAdmin(categoriaId: number): Observable<Categoria> {
    return this.http.get<Categoria>(
      `${this.apiUrl}/categorias/admin/${categoriaId}`,
    );
  }

  /** POST /categorias. */
  crearCategoria(payload: CategoriaCreatePayload): Observable<Categoria> {
    return this.http.post<Categoria>(`${this.apiUrl}/categorias`, payload);
  }

  /** PATCH /categorias/{categoria_id} (solo campos modificados). */
  actualizarCategoria(
    categoriaId: number,
    payload: CategoriaUpdatePayload,
  ): Observable<Categoria> {
    return this.http.patch<Categoria>(
      `${this.apiUrl}/categorias/${categoriaId}`,
      payload,
    );
  }

  /** PATCH /categorias/{categoria_id}/estado. */
  cambiarEstadoCategoria(
    categoriaId: number,
    estado: boolean,
  ): Observable<Categoria> {
    const payload: CategoriaEstadoPayload = { estado };
    return this.http.patch<Categoria>(
      `${this.apiUrl}/categorias/${categoriaId}/estado`,
      payload,
    );
  }
}
