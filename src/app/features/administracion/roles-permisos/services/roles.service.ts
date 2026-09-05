import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import {
  ModuloPermisos,
  RolPermisos,
  RolPermisosUpdate,
} from '../models/permiso.model';
import {
  Rol,
  RolCreateRequest,
  RolDetalle,
  RolUpdateRequest,
} from '../models/rol.model';

/**
 * Servicio de Roles (compartido por CU03 y CU04).
 *
 * CU03 (Gestionar Usuarios) usa `listarRolesAsignablesInternos()`.
 * CU04 (Gestionar Roles y Permisos) usa el resto de métodos.
 *
 * Consume únicamente los endpoints reales del backend FastAPI:
 * GET    /roles
 * GET    /roles/{rol_id}
 * POST   /roles
 * PATCH  /roles/{rol_id}
 * PATCH  /roles/{rol_id}/estado
 * GET    /roles/catalogo-permisos
 * GET    /roles/{rol_id}/permisos
 * PUT    /roles/{rol_id}/permisos
 *
 * El JWT se adjunta automáticamente mediante el interceptor global.
 */
@Injectable({ providedIn: 'root' })
export class RolesService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** GET /roles?asignable_interno=true (catálogo usado por CU03). */
  listarRolesAsignablesInternos(): Observable<Rol[]> {
    const params = new HttpParams().set('asignable_interno', 'true');
    return this.http.get<Rol[]>(`${this.apiUrl}/roles`, { params });
  }

  /** GET /roles (todos los roles, incluidos inactivos). */
  listarRoles(): Observable<Rol[]> {
    return this.http.get<Rol[]>(`${this.apiUrl}/roles`);
  }

  /** GET /roles/{rol_id}. */
  obtenerRol(rolId: number): Observable<RolDetalle> {
    return this.http.get<RolDetalle>(`${this.apiUrl}/roles/${rolId}`);
  }

  /** POST /roles (201 Created). */
  crearRol(payload: RolCreateRequest): Observable<Rol> {
    return this.http.post<Rol>(`${this.apiUrl}/roles`, payload);
  }

  /** PATCH /roles/{rol_id} (nombre y/o descripción). */
  actualizarRol(rolId: number, payload: RolUpdateRequest): Observable<Rol> {
    return this.http.patch<Rol>(`${this.apiUrl}/roles/${rolId}`, payload);
  }

  /** PATCH /roles/{rol_id}/estado (habilitar/deshabilitar). */
  cambiarEstadoRol(rolId: number, estado: boolean): Observable<Rol> {
    return this.http.patch<Rol>(`${this.apiUrl}/roles/${rolId}/estado`, {
      estado,
    });
  }

  /** GET /roles/catalogo-permisos (jerarquía Modulo -> Funcion -> Acciones). */
  obtenerCatalogoPermisos(): Observable<ModuloPermisos[]> {
    return this.http.get<ModuloPermisos[]>(`${this.apiUrl}/roles/catalogo-permisos`);
  }

  /** GET /roles/{rol_id}/permisos (matriz otorgada del rol). */
  obtenerPermisosRol(rolId: number): Observable<RolPermisos> {
    return this.http.get<RolPermisos>(`${this.apiUrl}/roles/${rolId}/permisos`);
  }

  /** PUT /roles/{rol_id}/permisos (reemplazo atómico de la matriz). */
  guardarPermisosRol(
    rolId: number,
    payload: RolPermisosUpdate,
  ): Observable<RolPermisos> {
    return this.http.put<RolPermisos>(
      `${this.apiUrl}/roles/${rolId}/permisos`,
      payload,
    );
  }
}
