import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import {
  TenantColeccion,
  TenantColeccionDetalle,
  TenantPrecioPromocional,
  TenantProductosAsociados,
  TenantPromocion,
  TenantTemporada,
  TenantTemporadaDetalle,
} from '../models/tenant-merchandising.model';

export interface FiltrosTenantTemporadas {
  buscar?: string;
  estado?: boolean;
  limit?: number;
  offset?: number;
}

export interface FiltrosTenantColecciones extends FiltrosTenantTemporadas {
  temporada_id?: number;
}

export interface FiltrosTenantPromociones extends FiltrosTenantTemporadas {
  tipo_descuento?: 'PORCENTAJE' | 'MONTO';
  vigentes?: boolean;
}

@Injectable({ providedIn: 'root' })
export class TenantMerchandisingService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl.replace(/\/+$/, '')}/tenant/merchandising`;

  listarTemporadas(filtros: FiltrosTenantTemporadas = {}): Observable<TenantTemporada[]> {
    return this.http.get<TenantTemporada[]>(`${this.base}/temporadas`, { params: this.params(filtros) });
  }

  obtenerTemporada(id: number): Observable<TenantTemporadaDetalle> {
    return this.http.get<TenantTemporadaDetalle>(`${this.base}/temporadas/${id}`);
  }

  listarColecciones(filtros: FiltrosTenantColecciones = {}): Observable<TenantColeccion[]> {
    return this.http.get<TenantColeccion[]>(`${this.base}/colecciones`, { params: this.params(filtros) });
  }

  obtenerColeccion(id: number): Observable<TenantColeccionDetalle> {
    return this.http.get<TenantColeccionDetalle>(`${this.base}/colecciones/${id}`);
  }

  listarProductosColeccion(id: number): Observable<TenantProductosAsociados> {
    return this.http.get<TenantProductosAsociados>(`${this.base}/colecciones/${id}/productos`).pipe(map(this.normalizarProductos));
  }

  listarPromociones(filtros: FiltrosTenantPromociones = {}): Observable<TenantPromocion[]> {
    return this.http.get<TenantPromocion[]>(`${this.base}/promociones`, { params: this.params(filtros) }).pipe(
      map((items) => items.map((item) => ({ ...item, valor_descuento: Number(item.valor_descuento) }))),
    );
  }

  obtenerPromocion(id: number): Observable<TenantPromocion> {
    return this.http.get<TenantPromocion>(`${this.base}/promociones/${id}`).pipe(map((item) => ({ ...item, valor_descuento: Number(item.valor_descuento) })));
  }

  listarProductosPromocion(id: number): Observable<TenantProductosAsociados> {
    return this.http.get<TenantProductosAsociados>(`${this.base}/promociones/${id}/productos`).pipe(map(this.normalizarProductos));
  }

  precioPromocional(productoId: number): Observable<TenantPrecioPromocional> {
    return this.http.get<TenantPrecioPromocional>(`${this.base}/productos/${productoId}/precio-promocional`).pipe(
      map((respuesta) => ({
        ...respuesta,
        precio_base: Number(respuesta.precio_base),
        precio_promocional: respuesta.precio_promocional === null ? null : Number(respuesta.precio_promocional),
        promociones_vigentes: respuesta.promociones_vigentes.map((item) => ({ ...item, valor_descuento: Number(item.valor_descuento) })),
      })),
    );
  }

  private params(filtros: object): HttpParams {
    let params = new HttpParams();
    Object.entries(filtros).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    });
    return params;
  }

  private normalizarProductos(respuesta: TenantProductosAsociados): TenantProductosAsociados {
    return { ...respuesta, productos: respuesta.productos.map((producto) => ({ ...producto, precio: Number(producto.precio) })) };
  }
}
