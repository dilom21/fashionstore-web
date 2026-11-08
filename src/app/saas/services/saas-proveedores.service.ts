import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpParams } from '@angular/common/http';

import { environment } from '../../../environments/environment';
import {
  TenantProveedorCreado,
  TenantProveedorCrear,
  TenantProveedor,
  TenantProducto,
  TenantProveedorProductosResultado,
} from '../models/tenant.models';

export interface FiltroProveedoresTenant {
  buscar?: string | null;
  estado?: boolean | null;
  limit?: number;
  offset?: number;
}

/**
 * Alta tenant de proveedores (`/tenant/proveedores`).
 *
 * Contrato (5C0):
 * - `POST /tenant/proveedores` exige `COMPRAS/GESTIONAR` y devuelve 201.
 * - `PUT /tenant/proveedores/{id}/productos` reemplaza las asociaciones.
 * - `empresa_id` y `usuario_id` NUNCA viajan: los deriva el backend.
 *
 * Errores esperables:
 * - 403: rol sin `COMPRAS/GESTIONAR`, contexto cliente o producto de otra
 *   empresa.
 * - 409: NIT duplicado dentro de la empresa o conflicto de datos.
 * - 422: validación del DTO.
 * - 503: módulo de compras SaaS apagado.
 */
@Injectable({ providedIn: 'root' })
export class SaasProveedoresService {
  private readonly http = inject(HttpClient);

  /** URL base de la API normalizada (sin barra final). */
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** Prefijo exacto del recurso (sin `/` final). */
  private readonly base = `${this.apiUrl}/tenant/proveedores`;

  /** `GET /tenant/proveedores` — listado paginado y filtrable. */
  listar(filtros: FiltroProveedoresTenant = {}): Observable<TenantProveedor[]> {
    let params = new HttpParams();
    const buscar = (filtros.buscar ?? '').trim();
    if (buscar) params = params.set('buscar', buscar);
    if (filtros.estado !== undefined && filtros.estado !== null) {
      params = params.set('estado', filtros.estado);
    }
    if (filtros.limit !== undefined) params = params.set('limit', filtros.limit);
    if (filtros.offset !== undefined) params = params.set('offset', filtros.offset);
    return this.http.get<TenantProveedor[]>(this.base, { params });
  }

  /** `GET /tenant/proveedores/{id}` — detalle empresarial. */
  obtener(id: number): Observable<TenantProveedorCreado> {
    return this.http.get<TenantProveedorCreado>(`${this.base}/${id}`);
  }

  /** `GET /tenant/proveedores/{id}/productos` — productos asociados. */
  listarProductos(id: number): Observable<TenantProducto[]> {
    return this.http.get<TenantProducto[]>(`${this.base}/${id}/productos`);
  }

  /** `POST /tenant/proveedores` — crea un proveedor de la empresa (201). */
  crear(dto: TenantProveedorCrear): Observable<TenantProveedorCreado> {
    return this.http.post<TenantProveedorCreado>(this.base, dto);
  }

  /** `PUT /tenant/proveedores/{id}/productos` — reemplaza asociaciones (200). */
  reemplazarProductos(
    proveedorId: number,
    productoIds: number[],
  ): Observable<TenantProveedorProductosResultado> {
    return this.http.put<TenantProveedorProductosResultado>(
      `${this.base}/${proveedorId}/productos`,
      { producto_ids: productoIds },
    );
  }
}
