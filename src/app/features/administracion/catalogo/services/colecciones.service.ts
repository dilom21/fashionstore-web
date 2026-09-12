import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import {
  Coleccion,
  ColeccionCreatePayload,
  ColeccionDetalle,
  ColeccionEstadoPayload,
  ColeccionListarFiltros,
  ColeccionProductos,
  ColeccionProductosUpdatePayload,
  ColeccionUpdatePayload,
  ProductoColeccionResumen,
} from '../models/coleccion.model';

/**
 * Servicio de Colecciones y asignación de productos (CU08).
 *
 * Consume el contrato real del backend:
 * GET/POST /colecciones, GET/PATCH /colecciones/{id},
 * PATCH /colecciones/{id}/estado,
 * GET/PUT /colecciones/{id}/productos.
 *
 * El PUT reemplaza el conjunto COMPLETO de productos (no hay request por
 * checkbox). El JWT se adjunta automáticamente mediante el interceptor global.
 */
@Injectable({ providedIn: 'root' })
export class ColeccionesService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** GET /colecciones (filtros: buscar, temporada_id, estado). */
  listarColecciones(
    filtros: ColeccionListarFiltros = {},
  ): Observable<Coleccion[]> {
    let params = new HttpParams();

    const buscar = filtros.buscar?.trim();
    if (buscar) {
      params = params.set('buscar', buscar);
    }
    if (
      filtros.temporada_id !== undefined &&
      filtros.temporada_id !== null
    ) {
      params = params.set('temporada_id', filtros.temporada_id.toString());
    }
    if (filtros.estado !== undefined && filtros.estado !== null) {
      params = params.set('estado', String(filtros.estado));
    }

    return this.http.get<Coleccion[]>(`${this.apiUrl}/colecciones`, { params });
  }

  /** GET /colecciones/{coleccion_id} (incluye temporada y total_productos). */
  obtenerColeccion(coleccionId: number): Observable<ColeccionDetalle> {
    return this.http.get<ColeccionDetalle>(
      `${this.apiUrl}/colecciones/${coleccionId}`,
    );
  }

  /** POST /colecciones. */
  crearColeccion(payload: ColeccionCreatePayload): Observable<Coleccion> {
    return this.http.post<Coleccion>(`${this.apiUrl}/colecciones`, payload);
  }

  /** PATCH /colecciones/{coleccion_id} (solo campos modificados). */
  actualizarColeccion(
    coleccionId: number,
    payload: ColeccionUpdatePayload,
  ): Observable<Coleccion> {
    return this.http.patch<Coleccion>(
      `${this.apiUrl}/colecciones/${coleccionId}`,
      payload,
    );
  }

  /** PATCH /colecciones/{coleccion_id}/estado (habilitar/deshabilitar). */
  cambiarEstadoColeccion(
    coleccionId: number,
    estado: boolean,
  ): Observable<Coleccion> {
    const payload: ColeccionEstadoPayload = { estado };
    return this.http.patch<Coleccion>(
      `${this.apiUrl}/colecciones/${coleccionId}/estado`,
      payload,
    );
  }

  /** GET /colecciones/{coleccion_id}/productos. */
  listarProductos(coleccionId: number): Observable<ColeccionProductos> {
    return this.http
      .get<ColeccionProductos>(
        `${this.apiUrl}/colecciones/${coleccionId}/productos`,
      )
      .pipe(map((respuesta) => this.normalizarProductos(respuesta)));
  }

  /**
   * PUT /colecciones/{coleccion_id}/productos.
   *
   * Reemplaza el conjunto completo e idempotente de productos asignados.
   * Una lista vacía elimina todas las asignaciones.
   */
  reemplazarProductos(
    coleccionId: number,
    productoIds: number[],
  ): Observable<ColeccionProductos> {
    const payload: ColeccionProductosUpdatePayload = {
      producto_ids: productoIds,
    };
    return this.http
      .put<ColeccionProductos>(
        `${this.apiUrl}/colecciones/${coleccionId}/productos`,
        payload,
      )
      .pipe(map((respuesta) => this.normalizarProductos(respuesta)));
  }

  /** El backend serializa `precio` (Decimal) como número o string. */
  private normalizarProductos(
    respuesta: ColeccionProductos,
  ): ColeccionProductos {
    return {
      ...respuesta,
      productos: respuesta.productos.map(
        (producto): ProductoColeccionResumen => ({
          ...producto,
          precio: Number(producto.precio),
        }),
      ),
    };
  }
}
