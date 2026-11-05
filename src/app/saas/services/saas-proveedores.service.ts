import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  TenantProveedorCreado,
  TenantProveedorCrear,
  TenantProveedorProductosResultado,
} from '../models/tenant.models';

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
