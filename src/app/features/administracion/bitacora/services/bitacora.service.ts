import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import {
  BitacoraCatalogos,
  BitacoraEvento,
  BitacoraListResponse,
  BitacoraListarFiltros,
} from '../models/bitacora.model';

/**
 * Servicio de Bitácora (CU05 - Consultar Bitácora del Sistema).
 *
 * Consume únicamente los endpoints reales de solo lectura del backend:
 * GET /bitacora
 * GET /bitacora/catalogos
 * GET /bitacora/{bitacora_id}
 *
 * No existen operaciones de escritura para la bitácora. El JWT se adjunta
 * automáticamente mediante el interceptor global.
 */
@Injectable({ providedIn: 'root' })
export class BitacoraService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** GET /bitacora (listado paginado y filtrado). */
  listarBitacora(filtros: BitacoraListarFiltros): Observable<BitacoraListResponse> {
    let params = new HttpParams();
    if (filtros.buscar && filtros.buscar.trim().length > 0) {
      params = params.set('buscar', filtros.buscar.trim());
    }
    if (filtros.usuario_id !== undefined && filtros.usuario_id !== null) {
      params = params.set('usuario_id', String(filtros.usuario_id));
    }
    if (filtros.accion && filtros.accion.trim().length > 0) {
      params = params.set('accion', filtros.accion.trim());
    }
    if (filtros.entidad_afectada && filtros.entidad_afectada.trim().length > 0) {
      params = params.set('entidad_afectada', filtros.entidad_afectada.trim());
    }
    if (filtros.fecha_desde) {
      params = params.set('fecha_desde', filtros.fecha_desde);
    }
    if (filtros.fecha_hasta) {
      params = params.set('fecha_hasta', filtros.fecha_hasta);
    }
    if (filtros.limit !== undefined && filtros.limit !== null) {
      params = params.set('limit', String(filtros.limit));
    }
    if (filtros.offset !== undefined && filtros.offset !== null) {
      params = params.set('offset', String(filtros.offset));
    }
    return this.http.get<BitacoraListResponse>(`${this.apiUrl}/bitacora`, { params });
  }

  /** GET /bitacora/catalogos (acciones, entidades y usuarios reales). */
  obtenerCatalogos(): Observable<BitacoraCatalogos> {
    return this.http.get<BitacoraCatalogos>(`${this.apiUrl}/bitacora/catalogos`);
  }

  /** GET /bitacora/{bitacora_id} (detalle de un evento). */
  obtenerBitacora(bitacoraId: number): Observable<BitacoraEvento> {
    return this.http.get<BitacoraEvento>(`${this.apiUrl}/bitacora/${bitacoraId}`);
  }
}
