import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import {
  MovimientoInventarioConsultaFiltros,
  MovimientoInventarioConsultaResponse,
} from '../models/movimiento-inventario.model';

/**
 * Servicio de consulta de movimientos de inventario (CU14). SOLO LECTURA.
 *
 * Consume el endpoint real GET /movimientos-inventario con filtros y paginación
 * (limit/offset). Construye HttpParams solo con los filtros que tienen valor.
 *
 * Para el ENCARGADO_SUCURSAL no se envía `sucursal_id`: el backend obtiene
 * `empleado.sucursal_id` y restringe los resultados. La seguridad real vive en
 * el backend; aquí no se reproduce.
 *
 * El JWT se adjunta automáticamente mediante el interceptor global.
 */
@Injectable({ providedIn: 'root' })
export class MovimientoInventarioService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** GET /movimientos-inventario (filtros + paginación). */
  obtenerMovimientos(
    filtros: MovimientoInventarioConsultaFiltros = {},
  ): Observable<MovimientoInventarioConsultaResponse> {
    let params = new HttpParams();

    const producto = filtros.producto?.trim();
    if (producto) {
      params = params.set('producto', producto);
    }
    const referenciaTipo = filtros.referencia_tipo?.trim();
    if (referenciaTipo) {
      params = params.set('referencia_tipo', referenciaTipo);
    }
    if (filtros.sucursal_id !== undefined && filtros.sucursal_id !== null) {
      params = params.set('sucursal_id', filtros.sucursal_id.toString());
    }
    if (filtros.tipo) {
      params = params.set('tipo', filtros.tipo);
    }
    if (filtros.producto_id !== undefined && filtros.producto_id !== null) {
      params = params.set('producto_id', filtros.producto_id.toString());
    }
    if (
      filtros.variante_producto_id !== undefined &&
      filtros.variante_producto_id !== null
    ) {
      params = params.set(
        'variante_producto_id',
        filtros.variante_producto_id.toString(),
      );
    }
    if (filtros.temporada_id !== undefined && filtros.temporada_id !== null) {
      params = params.set('temporada_id', filtros.temporada_id.toString());
    }
    if (filtros.usuario_id !== undefined && filtros.usuario_id !== null) {
      params = params.set('usuario_id', filtros.usuario_id.toString());
    }
    if (filtros.fecha_desde) {
      params = params.set('fecha_desde', filtros.fecha_desde);
    }
    if (filtros.fecha_hasta) {
      params = params.set('fecha_hasta', filtros.fecha_hasta);
    }
    if (filtros.limit !== undefined && filtros.limit !== null) {
      params = params.set('limit', filtros.limit.toString());
    }
    if (filtros.offset !== undefined && filtros.offset !== null) {
      params = params.set('offset', filtros.offset.toString());
    }

    return this.http.get<MovimientoInventarioConsultaResponse>(
      `${this.apiUrl}/movimientos-inventario`,
      { params },
    );
  }
}
