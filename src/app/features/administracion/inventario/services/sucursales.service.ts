import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import {
  Sucursal,
  SucursalCreatePayload,
  SucursalEstadoPayload,
  SucursalListarFiltros,
  SucursalUpdatePayload,
} from '../models/sucursal.model';

/**
 * Servicio de Sucursales (CU06), compartido con CU03.
 *
 * - `listarSucursalesActivas()` conserva la firma que usa Gestión de Usuarios
 *   (CU03): GET /sucursales sin filtros, que el backend responde solo con
 *   sucursales activas.
 * - El resto de métodos consumen el CRUD real de CU06:
 *   GET /sucursales, GET /sucursales/{id}, POST /sucursales,
 *   PATCH /sucursales/{id} y PATCH /sucursales/{id}/estado.
 *
 * El JWT se adjunta automáticamente mediante el interceptor global.
 */
@Injectable({ providedIn: 'root' })
export class SucursalesService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** GET /sucursales (sin estado: el backend responde solo activas). CU03. */
  listarSucursalesActivas(): Observable<Sucursal[]> {
    return this.http.get<Sucursal[]>(`${this.apiUrl}/sucursales`);
  }

  /** GET /sucursales con filtros buscar / ciudad_id / estado. */
  listarSucursales(filtros: SucursalListarFiltros = {}): Observable<Sucursal[]> {
    let params = new HttpParams();

    const buscar = filtros.buscar?.trim();
    if (buscar) {
      params = params.set('buscar', buscar);
    }
    if (filtros.ciudad_id !== undefined && filtros.ciudad_id !== null) {
      params = params.set('ciudad_id', filtros.ciudad_id.toString());
    }
    if (filtros.estado !== undefined && filtros.estado !== null) {
      params = params.set('estado', String(filtros.estado));
    }

    return this.http.get<Sucursal[]>(`${this.apiUrl}/sucursales`, { params });
  }

  /** GET /sucursales/{sucursal_id}. */
  obtenerSucursal(sucursalId: number): Observable<Sucursal> {
    return this.http.get<Sucursal>(`${this.apiUrl}/sucursales/${sucursalId}`);
  }

  /** POST /sucursales. */
  crearSucursal(payload: SucursalCreatePayload): Observable<Sucursal> {
    return this.http.post<Sucursal>(`${this.apiUrl}/sucursales`, payload);
  }

  /** PATCH /sucursales/{sucursal_id} (solo campos modificados). */
  actualizarSucursal(sucursalId: number, payload: SucursalUpdatePayload): Observable<Sucursal> {
    return this.http.patch<Sucursal>(`${this.apiUrl}/sucursales/${sucursalId}`, payload);
  }

  /** PATCH /sucursales/{sucursal_id}/estado (habilitar/deshabilitar). */
  cambiarEstadoSucursal(sucursalId: number, estado: boolean): Observable<Sucursal> {
    const payload: SucursalEstadoPayload = { estado };
    return this.http.patch<Sucursal>(`${this.apiUrl}/sucursales/${sucursalId}/estado`, payload);
  }
}
