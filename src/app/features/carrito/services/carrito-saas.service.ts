import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  ActualizarCantidadSaasPayload,
  AgregarItemSaasPayload,
  CarritoDetalleSaasCrudo,
  CarritoItemTenantResponse,
  EstadoCarritoTenantResponse,
  normalizarDetalleSaas,
  normalizarListaSaas,
} from '../models/carrito-saas.model';
import { CarritoDetalle, CarritoListaResponse } from '../models/carrito.model';

/**
 * Acceso HTTP EXCLUSIVO al contrato de carrito SaaS (`/tenant/carritos`).
 *
 * No se usa en `saasMode=false`: el facade `CarritoService` decide la ruta.
 * El JWT empresarial lo añade el interceptor global para las rutas `/tenant/**`;
 * aquí no se envía `empresa_id` ni `cliente_id` (los obtiene FastAPI del token).
 */
@Injectable({ providedIn: 'root' })
export class CarritoSaasService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl.replace(/\/+$/, '')}/tenant/carritos`;

  /** POST /tenant/carritos/items (variante + temporada; el backend resuelve inventario). */
  agregarItem(
    payload: AgregarItemSaasPayload,
  ): Observable<CarritoItemTenantResponse> {
    return this.http.post<CarritoItemTenantResponse>(
      `${this.base}/items`,
      payload,
    );
  }

  /** GET /tenant/carritos?limit=50&offset=0 */
  listar(limit = 50, offset = 0): Observable<CarritoListaResponse> {
    const params = new HttpParams()
      .set('limit', limit.toString())
      .set('offset', offset.toString());
    return this.http
      .get<unknown>(this.base, { params })
      .pipe(map(normalizarListaSaas));
  }

  /** GET /tenant/carritos/{carrito_id} */
  obtener(carritoId: number): Observable<CarritoDetalle> {
    return this.http
      .get<CarritoDetalleSaasCrudo>(`${this.base}/${carritoId}`)
      .pipe(map((detalle) => normalizarDetalleSaas(detalle)));
  }

  /** PATCH /tenant/carritos/{carrito_id}/items/{detalle_id} */
  actualizarCantidad(
    carritoId: number,
    detalleId: number,
    cantidad: number,
  ): Observable<CarritoItemTenantResponse> {
    const payload: ActualizarCantidadSaasPayload = { cantidad };
    return this.http.patch<CarritoItemTenantResponse>(
      `${this.base}/${carritoId}/items/${detalleId}`,
      payload,
    );
  }

  /** DELETE /tenant/carritos/{carrito_id}/items/{detalle_id} */
  eliminarDetalle(
    carritoId: number,
    detalleId: number,
  ): Observable<EstadoCarritoTenantResponse> {
    return this.http.delete<EstadoCarritoTenantResponse>(
      `${this.base}/${carritoId}/items/${detalleId}`,
    );
  }

  /** DELETE /tenant/carritos/{carrito_id} */
  eliminarCarrito(carritoId: number): Observable<EstadoCarritoTenantResponse> {
    return this.http.delete<EstadoCarritoTenantResponse>(
      `${this.base}/${carritoId}`,
    );
  }
}
