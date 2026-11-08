import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { TenantApiService } from '../../../saas/services/tenant-api.service';
import {
  MovimientoInventarioConsultaFiltros,
  MovimientoInventarioConsultaResponse,
} from '../models/movimiento-inventario.model';

/**
 * Servicio de consulta de movimientos de inventario (CU14) en modo EMPRESARIAL.
 * SOLO LECTURA (kardex: nunca crea, edita ni elimina movimientos).
 *
 * Consume `GET /tenant/inventario/movimientos` (tag Swagger `Inventario SaaS`)
 * con los mismos filtros del primer parcial y paginación (limit/offset).
 *
 * Autorización: exclusivamente el JWT EMPRESARIAL que añade
 * `TenantApiService.consultar()`. Nunca el JWT legacy y nunca `empresa_id` como
 * identidad: el backend lo obtiene del token y aplica RLS.
 *
 * `usuario_correo` puede llegar en `null` cuando RLS restringe la visibilidad
 * del autor: es un movimiento VÁLIDO y se conserva (no se descarta ni se trata
 * como registro inválido).
 *
 * Para el ENCARGADO_SUCURSAL no se envía `sucursal_id`: el backend limita los
 * resultados a su sucursal desde el perfil autenticado.
 */
@Injectable({ providedIn: 'root' })
export class MovimientoInventarioService {
  private readonly tenantApi = inject(TenantApiService);

  /** GET /tenant/inventario/movimientos (filtros + paginación). */
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

    return this.tenantApi.consultar<MovimientoInventarioConsultaResponse>(
      '/tenant/inventario/movimientos',
      params,
    );
  }
}
