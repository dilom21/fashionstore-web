import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { TenantEmpresa } from '../models/tenant.models';

/**
 * Datos de la empresa autenticada.
 *
 * Solo se exponen los endpoints tenant ya publicados por el backend. Cualquier
 * dato que no esté en el contrato (sucursales listadas, personal, catálogo) se
 * resolverá cuando exista su endpoint P1.
 */
@Injectable({ providedIn: 'root' })
export class SaasEmpresaService {
  private readonly http = inject(HttpClient);

  /** URL base de la API normalizada (sin barra final). */
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** `GET /tenant/empresa/me` — empresa + suscripción vigente. */
  obtenerEmpresa(): Observable<TenantEmpresa> {
    return this.http.get<TenantEmpresa>(`${this.apiUrl}/tenant/empresa/me`);
  }
}
