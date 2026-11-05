import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { TenantInventario } from '../models/tenant.models';

/**
 * Filtros de `GET /tenant/inventario`.
 *
 * `sucursal_id` es `> 0`; `texto` 1..60; `limit` 1..200 (default 50) y
 * `offset` >= 0. Los valores inválidos se omiten para que el backend aplique
 * sus defaults en lugar de responder 422.
 */
export interface FiltroInventarioTenant {
  sucursal_id?: number | null;
  texto?: string | null;
  limit?: number;
  offset?: number;
}

/**
 * Inventario de la empresa (`/tenant/inventario`).
 *
 * - Lectura: requiere `VENTAS/CONSULTAR` (403 en otro caso).
 * - `stock_disponible` lo calcula el backend (`stock_actual - stock_reservado`);
 *   la UI solo lo presenta y lo usa para limitar cantidades.
 * - El `empresa_id` nunca viaja: lo resuelve el JWT de la membresía.
 */
@Injectable({ providedIn: 'root' })
export class SaasInventarioService {
  private readonly http = inject(HttpClient);

  /** URL base de la API normalizada (sin barra final). */
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** Prefijo exacto del recurso (sin `/` final). */
  private readonly base = `${this.apiUrl}/tenant/inventario`;

  /**
   * `GET /tenant/inventario` — inventario filtrable por sucursal y texto.
   *
   * Errores esperables: 403 sin `VENTAS/CONSULTAR`, 422 si un filtro no cumple
   * el rango (por eso se omiten los inválidos).
   */
  listar(
    filtro: FiltroInventarioTenant = {},
  ): Observable<TenantInventario[]> {
    let params = new HttpParams();

    if (
      filtro.sucursal_id !== undefined &&
      filtro.sucursal_id !== null &&
      Number.isInteger(filtro.sucursal_id) &&
      filtro.sucursal_id > 0
    ) {
      params = params.set('sucursal_id', filtro.sucursal_id);
    }
    const texto = (filtro.texto ?? '').trim();
    if (texto.length > 0 && texto.length <= 60) {
      params = params.set('texto', texto);
    }
    if (
      filtro.limit !== undefined &&
      Number.isInteger(filtro.limit) &&
      filtro.limit >= 1 &&
      filtro.limit <= 200
    ) {
      params = params.set('limit', filtro.limit);
    }
    if (
      filtro.offset !== undefined &&
      Number.isInteger(filtro.offset) &&
      filtro.offset >= 0
    ) {
      params = params.set('offset', filtro.offset);
    }

    return this.http.get<TenantInventario[]>(this.base, { params });
  }
}
