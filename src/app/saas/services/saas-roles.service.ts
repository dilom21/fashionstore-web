import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  MatrizPermisos,
  PermisoCambio,
  PermisosActualizados,
  TenantRol,
} from '../models/tenant.models';

/**
 * Roles y matriz de permisos de la empresa (`/tenant/empresa/roles` y
 * `/tenant/empresa/permisos`).
 *
 * No existe endpoint tenant para crear, renombrar ni eliminar roles: esta
 * pantalla solo consulta roles existentes y edita excepciones de permisos.
 * La matriz del rol ADMINISTRADOR es de solo lectura en el backend (409).
 */
@Injectable({ providedIn: 'root' })
export class SaasRolesService {
  private readonly http = inject(HttpClient);

  /** URL base de la API normalizada (sin barra final). */
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** `GET /tenant/empresa/roles` — roles disponibles (solo ADMINISTRADOR). */
  listarRoles(): Observable<TenantRol[]> {
    return this.http.get<TenantRol[]>(`${this.apiUrl}/tenant/empresa/roles`);
  }

  /** `GET /tenant/empresa/permisos` — catálogo y matriz efectiva por rol. */
  obtenerMatriz(): Observable<MatrizPermisos> {
    return this.http.get<MatrizPermisos>(
      `${this.apiUrl}/tenant/empresa/permisos`,
    );
  }

  /**
   * `PATCH /tenant/empresa/roles/{rol_id}/permisos`.
   *
   * Se envían SOLO las filas modificadas (el backend admite entre 1 y 80).
   * Errores esperables: 409 si el rol es ADMINISTRADOR, 422 si la
   * función/acción no pertenece al catálogo.
   */
  guardarPermisos(
    rolId: number,
    permisos: PermisoCambio[],
  ): Observable<PermisosActualizados> {
    return this.http.patch<PermisosActualizados>(
      `${this.apiUrl}/tenant/empresa/roles/${rolId}/permisos`,
      { permisos },
    );
  }
}
