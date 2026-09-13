import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import {
  InventarioConsultaFiltros,
  InventarioConsultaResponse,
} from '../models/inventario.model';

/**
 * Servicio de consulta de inventario por sucursal (CU13). SOLO LECTURA.
 *
 * Consume el endpoint real GET /inventario con filtros y paginación
 * (limit/offset). Construye HttpParams solo con los filtros que tienen valor,
 * de modo que el backend aplique sus propios valores por defecto.
 *
 * Para el ENCARGADO_SUCURSAL no se envía `sucursal_id`: el backend obtiene
 * `empleado.sucursal_id` y restringe los resultados. La seguridad real vive en
 * el backend; aquí no se reproduce.
 *
 * El JWT se adjunta automáticamente mediante el interceptor global.
 */
@Injectable({ providedIn: 'root' })
export class InventarioService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** GET /inventario (filtros + paginación; solo se envían los que tienen valor). */
  obtenerInventario(
    filtros: InventarioConsultaFiltros = {},
  ): Observable<InventarioConsultaResponse> {
    let params = new HttpParams();

    const producto = filtros.producto?.trim();
    if (producto) {
      params = params.set('producto', producto);
    }
    if (filtros.sucursal_id !== undefined && filtros.sucursal_id !== null) {
      params = params.set('sucursal_id', filtros.sucursal_id.toString());
    }
    if (filtros.producto_id !== undefined && filtros.producto_id !== null) {
      params = params.set('producto_id', filtros.producto_id.toString());
    }
    if (filtros.categoria_id !== undefined && filtros.categoria_id !== null) {
      params = params.set('categoria_id', filtros.categoria_id.toString());
    }
    if (filtros.talla_id !== undefined && filtros.talla_id !== null) {
      params = params.set('talla_id', filtros.talla_id.toString());
    }
    if (filtros.color_id !== undefined && filtros.color_id !== null) {
      params = params.set('color_id', filtros.color_id.toString());
    }
    if (filtros.temporada_id !== undefined && filtros.temporada_id !== null) {
      params = params.set('temporada_id', filtros.temporada_id.toString());
    }
    if (filtros.disponibilidad) {
      params = params.set('disponibilidad', filtros.disponibilidad);
    }
    if (filtros.limit !== undefined && filtros.limit !== null) {
      params = params.set('limit', filtros.limit.toString());
    }
    if (filtros.offset !== undefined && filtros.offset !== null) {
      params = params.set('offset', filtros.offset.toString());
    }

    return this.http.get<InventarioConsultaResponse>(
      `${this.apiUrl}/inventario`,
      { params },
    );
  }
}
