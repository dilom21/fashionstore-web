import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import {
  Promocion,
  PromocionCreatePayload,
  PromocionEstadoPayload,
  PromocionListarFiltros,
  PromocionProducto,
  PromocionProductos,
  PromocionProductosUpdatePayload,
  PromocionUpdatePayload,
} from '../models/promocion.model';

/**
 * Servicio de Promociones y asignación de productos (CU10).
 *
 * Consume el contrato real del backend:
 * GET/POST /promociones, GET/PATCH /promociones/{id},
 * PATCH /promociones/{id}/estado,
 * GET/PUT /promociones/{id}/productos.
 *
 * El PUT reemplaza el conjunto COMPLETO de productos (no hay request por
 * checkbox), es atómico e idempotente, deduplica IDs y acepta una lista vacía.
 *
 * Todos los endpoints requieren administrador (get_current_admin). El JWT se
 * adjunta automáticamente mediante el interceptor global.
 */
@Injectable({ providedIn: 'root' })
export class PromocionesService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** GET /promociones (filtros: buscar, estado, tipo_descuento). */
  listarPromociones(
    filtros: PromocionListarFiltros = {},
  ): Observable<Promocion[]> {
    let params = new HttpParams();

    const buscar = filtros.buscar?.trim();
    if (buscar) {
      params = params.set('buscar', buscar);
    }
    if (filtros.estado !== undefined && filtros.estado !== null) {
      params = params.set('estado', String(filtros.estado));
    }
    if (filtros.tipo_descuento) {
      params = params.set('tipo_descuento', filtros.tipo_descuento);
    }

    return this.http
      .get<Promocion[]>(`${this.apiUrl}/promociones`, { params })
      .pipe(map((promociones) => promociones.map((p) => this.normalizar(p))));
  }

  /** GET /promociones/{promocion_id}. */
  obtenerPromocion(promocionId: number): Observable<Promocion> {
    return this.http
      .get<Promocion>(`${this.apiUrl}/promociones/${promocionId}`)
      .pipe(map((promocion) => this.normalizar(promocion)));
  }

  /** POST /promociones. */
  crearPromocion(payload: PromocionCreatePayload): Observable<Promocion> {
    return this.http
      .post<Promocion>(`${this.apiUrl}/promociones`, payload)
      .pipe(map((promocion) => this.normalizar(promocion)));
  }

  /** PATCH /promociones/{promocion_id} (solo campos modificados). */
  actualizarPromocion(
    promocionId: number,
    payload: PromocionUpdatePayload,
  ): Observable<Promocion> {
    return this.http
      .patch<Promocion>(`${this.apiUrl}/promociones/${promocionId}`, payload)
      .pipe(map((promocion) => this.normalizar(promocion)));
  }

  /** PATCH /promociones/{promocion_id}/estado (habilitar/deshabilitar). */
  cambiarEstadoPromocion(
    promocionId: number,
    estado: boolean,
  ): Observable<Promocion> {
    const payload: PromocionEstadoPayload = { estado };
    return this.http
      .patch<Promocion>(
        `${this.apiUrl}/promociones/${promocionId}/estado`,
        payload,
      )
      .pipe(map((promocion) => this.normalizar(promocion)));
  }

  /** GET /promociones/{promocion_id}/productos. */
  listarProductos(promocionId: number): Observable<PromocionProductos> {
    return this.http
      .get<PromocionProductos>(
        `${this.apiUrl}/promociones/${promocionId}/productos`,
      )
      .pipe(map((respuesta) => this.normalizarProductos(respuesta)));
  }

  /**
   * PUT /promociones/{promocion_id}/productos.
   *
   * Reemplaza el conjunto completo e idempotente de productos asignados.
   * Una lista vacía elimina todas las asignaciones.
   */
  reemplazarProductos(
    promocionId: number,
    productoIds: number[],
  ): Observable<PromocionProductos> {
    const payload: PromocionProductosUpdatePayload = {
      producto_ids: productoIds,
    };
    return this.http
      .put<PromocionProductos>(
        `${this.apiUrl}/promociones/${promocionId}/productos`,
        payload,
      )
      .pipe(map((respuesta) => this.normalizarProductos(respuesta)));
  }

  /** El backend puede serializar `valor_descuento` (Decimal) como número o string. */
  private normalizar(promocion: Promocion): Promocion {
    return { ...promocion, valor_descuento: Number(promocion.valor_descuento) };
  }

  /** El backend serializa `precio` (Decimal) como número o string. */
  private normalizarProductos(
    respuesta: PromocionProductos,
  ): PromocionProductos {
    return {
      ...respuesta,
      productos: respuesta.productos.map(
        (producto): PromocionProducto => ({
          ...producto,
          precio: Number(producto.precio),
        }),
      ),
    };
  }
}
