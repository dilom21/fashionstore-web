import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import {
  DisponibilidadListarFiltros,
  DisponibilidadProducto,
  Producto,
  ProductoCreatePayload,
  ProductoDetalle,
  ProductoEstadoPayload,
  ProductoListarFiltros,
  ProductoUpdatePayload,
} from '../models/producto.model';

/**
 * Servicio de Productos (CU07) con contrato mixto.
 *
 * - Métodos `*Publico*` conservan el contrato público existente:
 *   GET /productos, GET /productos/{id}, GET /productos/{id}/disponibilidad.
 * - Métodos `*Admin*` consumen el CRUD lógico administrativo:
 *   GET /productos/admin, GET /productos/admin/{id}, POST /productos,
 *   PATCH /productos/{id}, PATCH /productos/{id}/estado.
 *
 * No se reemplazan los endpoints públicos por los /admin: ambos conviven para
 * no romper landing, catálogo cliente ni disponibilidad.
 *
 * El JWT se adjunta automáticamente mediante el interceptor global.
 */
@Injectable({ providedIn: 'root' })
export class ProductosService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  // ===== Contrato público (no romper) =====

  /**
   * GET /productos (solo activos).
   *
   * Contrato público CU09: admite búsqueda y filtros por categoría, talla,
   * color, temporada, colección, sucursal y disponibilidad de stock.
   */
  listarProductosPublicos(
    filtros: ProductoListarFiltros = {},
  ): Observable<Producto[]> {
    const params = this.construirParams({
      buscar: filtros.buscar,
      categoria_id: filtros.categoria_id,
      talla_id: filtros.talla_id,
      color_id: filtros.color_id,
      temporada_id: filtros.temporada_id,
      coleccion_id: filtros.coleccion_id,
      sucursal_id: filtros.sucursal_id,
      con_stock: filtros.con_stock,
    });
    return this.http
      .get<Producto[]>(`${this.apiUrl}/productos`, { params })
      .pipe(map((productos) => productos.map((p) => this.normalizar(p))));
  }

  /** GET /productos/{producto_id} (detalle público con variantes/recursos). */
  obtenerProductoPublico(productoId: number): Observable<ProductoDetalle> {
    return this.http
      .get<ProductoDetalle>(`${this.apiUrl}/productos/${productoId}`)
      .pipe(map((producto) => this.normalizar(producto)));
  }

  /**
   * GET /productos/{producto_id}/disponibilidad.
   *
   * Contrato público CU09: admite filtrar por sucursal, talla, color y
   * temporada. El backend ya calcula `stock_disponible`.
   */
  obtenerDisponibilidad(
    productoId: number,
    filtros: DisponibilidadListarFiltros = {},
  ): Observable<DisponibilidadProducto> {
    const params = this.construirParamsDisponibilidad(filtros);
    return this.http.get<DisponibilidadProducto>(
      `${this.apiUrl}/productos/${productoId}/disponibilidad`,
      { params },
    );
  }

  // ===== Contrato administrativo (CU07) =====

  /** GET /productos/admin (activos e inactivos según filtro). */
  listarProductosAdmin(
    filtros: ProductoListarFiltros = {},
  ): Observable<Producto[]> {
    const params = this.construirParams({
      buscar: filtros.buscar,
      categoria_id: filtros.categoria_id,
      estado: filtros.estado,
    });
    return this.http
      .get<Producto[]>(`${this.apiUrl}/productos/admin`, { params })
      .pipe(map((productos) => productos.map((p) => this.normalizar(p))));
  }

  /** GET /productos/admin/{producto_id}. */
  obtenerProductoAdmin(productoId: number): Observable<Producto> {
    return this.http
      .get<Producto>(`${this.apiUrl}/productos/admin/${productoId}`)
      .pipe(map((producto) => this.normalizar(producto)));
  }

  /** POST /productos. */
  crearProducto(payload: ProductoCreatePayload): Observable<Producto> {
    return this.http
      .post<Producto>(`${this.apiUrl}/productos`, payload)
      .pipe(map((producto) => this.normalizar(producto)));
  }

  /** PATCH /productos/{producto_id} (solo campos modificados). */
  actualizarProducto(
    productoId: number,
    payload: ProductoUpdatePayload,
  ): Observable<Producto> {
    return this.http
      .patch<Producto>(`${this.apiUrl}/productos/${productoId}`, payload)
      .pipe(map((producto) => this.normalizar(producto)));
  }

  /** PATCH /productos/{producto_id}/estado (habilitar/deshabilitar). */
  cambiarEstadoProducto(
    productoId: number,
    estado: boolean,
  ): Observable<Producto> {
    const payload: ProductoEstadoPayload = { estado };
    return this.http
      .patch<Producto>(`${this.apiUrl}/productos/${productoId}/estado`, payload)
      .pipe(map((producto) => this.normalizar(producto)));
  }

  // ===== Utilidades =====

  private construirParams(valores: ProductoListarFiltros): HttpParams {
    let params = new HttpParams();

    const buscar = valores.buscar?.trim();
    if (buscar) {
      params = params.set('buscar', buscar);
    }
    params = this.agregarNumero(params, 'categoria_id', valores.categoria_id);
    params = this.agregarNumero(params, 'talla_id', valores.talla_id);
    params = this.agregarNumero(params, 'color_id', valores.color_id);
    params = this.agregarNumero(params, 'temporada_id', valores.temporada_id);
    params = this.agregarNumero(params, 'coleccion_id', valores.coleccion_id);
    params = this.agregarNumero(params, 'sucursal_id', valores.sucursal_id);
    if (valores.estado !== undefined && valores.estado !== null) {
      params = params.set('estado', String(valores.estado));
    }
    if (valores.con_stock === true) {
      params = params.set('con_stock', 'true');
    }

    return params;
  }

  private construirParamsDisponibilidad(
    valores: DisponibilidadListarFiltros,
  ): HttpParams {
    let params = new HttpParams();
    params = this.agregarNumero(params, 'sucursal_id', valores.sucursal_id);
    params = this.agregarNumero(params, 'talla_id', valores.talla_id);
    params = this.agregarNumero(params, 'color_id', valores.color_id);
    params = this.agregarNumero(params, 'temporada_id', valores.temporada_id);
    return params;
  }

  private agregarNumero(
    params: HttpParams,
    clave: string,
    valor: number | undefined,
  ): HttpParams {
    if (valor === undefined || valor === null) {
      return params;
    }
    return params.set(clave, valor.toString());
  }

  /** El backend puede serializar `precio` (Decimal) como número o string. */
  private normalizar<T extends { precio: number }>(entidad: T): T {
    return { ...entidad, precio: Number(entidad.precio) };
  }
}
