import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  TenantSucursal,
  TenantSucursalCrear,
  TenantSucursalActualizar,
} from '../models/tenant.models';

/**
 * Sucursales de la empresa autenticada (`/tenant/empresa/sucursales`).
 *
 * El `empresa_id` NUNCA viaja en el cuerpo ni en la URL: lo resuelve el backend
 * desde el JWT de la membres├¡a. Aqu├¡ solo se construyen las peticiones del
 * contrato, sin campos adicionales.
 *
 * - `GET`    listado: cualquier miembro con `SUCURSALES/CONSULTAR`.
 * - `POST`   alta: solo ADMINISTRADOR (403 en otro caso).
 * - `PATCH`  estado: solo ADMINISTRADOR.
 */
@Injectable({ providedIn: 'root' })
export class SaasSucursalesService {
  private readonly http = inject(HttpClient);

  /** URL base de la API normalizada (sin barra final). */
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** Prefijo exacto del recurso (sin `/` final). */
  private readonly base = `${this.apiUrl}/tenant/empresa/sucursales`;

  /** `GET /tenant/empresa/sucursales` ÔÇö sucursales de la empresa. */
  listar(): Observable<TenantSucursal[]> {
    return this.http.get<TenantSucursal[]>(this.base);
  }

  /** `GET /tenant/empresa/sucursales/{id}` ÔÇö detalle de una sucursal propia. */
  obtener(id: number): Observable<TenantSucursal> {
    return this.http.get<TenantSucursal>(`${this.base}/${id}`);
  }

  /**
   * `POST /tenant/empresa/sucursales` ÔÇö crea una sucursal activa.
   *
   * Errores esperables: 409 por l├¡mite del plan o ciudad ya usada, 404 cuando
   * la ciudad no existe/est├í inactiva, 422 por validaci├│n de campos.
   */
  crear(dto: TenantSucursalCrear): Observable<TenantSucursal> {
    return this.http.post<TenantSucursal>(this.base, dto);
  }

  /** `PATCH /tenant/empresa/sucursales/{id}` ÔÇö edita campos de la sucursal. */
  actualizar(id: number, dto: TenantSucursalActualizar): Observable<TenantSucursal> {
    return this.http.patch<TenantSucursal>(`${this.base}/${id}`, dto);
  }

  /**
   * `PATCH /tenant/empresa/sucursales/{id}/estado` ÔÇö activa o desactiva.
   *
   * Errores esperables: 409 si la sucursal tiene empleados o reservas activas,
   * o si su ciudad est├í inactiva al intentar habilitarla.
   */
  cambiarEstado(id: number, estado: boolean): Observable<TenantSucursal> {
    return this.http.patch<TenantSucursal>(`${this.base}/${id}/estado`, {
      estado,
    });
  }
}
