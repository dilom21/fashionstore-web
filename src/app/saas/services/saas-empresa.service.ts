import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { TenantEmpresa, TenantSuscripcion } from '../models/tenant.models';

/**
 * Datos de la empresa autenticada.
 *
 * Solo se exponen los endpoints tenant ya publicados por el backend. Cualquier
 * dato que no est├® en el contrato (sucursales listadas, personal, cat├ílogo) se
 * resolver├í cuando exista su endpoint P1.
 */
@Injectable({ providedIn: 'root' })
export class SaasEmpresaService {
  private readonly http = inject(HttpClient);

  /** URL base de la API normalizada (sin barra final). */
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** `GET /tenant/empresa/me` ÔÇö empresa + suscripci├│n vigente. */
  obtenerEmpresa(): Observable<TenantEmpresa> {
    return this.http.get<TenantEmpresa>(`${this.apiUrl}/tenant/empresa/me`);
  }

  /** `GET /tenant/empresa/plan` ÔÇö cupo vigente de la empresa autenticada. */
  obtenerPlan(): Observable<TenantSuscripcion> {
    return this.http.get<TenantSuscripcion>(`${this.apiUrl}/tenant/empresa/plan`);
  }

  /** `GET /tenant/empresa/suscripcion` ÔÇö suscripci├│n vigente. */
  obtenerSuscripcion(): Observable<TenantSuscripcion> {
    return this.http.get<TenantSuscripcion>(`${this.apiUrl}/tenant/empresa/suscripcion`);
  }
}
