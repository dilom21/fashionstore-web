import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  TenantInvitacionAceptarRequest,
  TenantInvitacionAceptarResponse,
  TenantLoginRequest,
  TenantLoginResponse,
  TenantMe,
} from '../models/tenant.models';
import { SaasSessionService } from './saas-session.service';

/**
 * Llamadas HTTP de autenticación del modo SaaS.
 *
 * Solo construye y ejecuta las peticiones del contrato tenant; el
 * almacenamiento de la sesión vive exclusivamente en `SaasSessionService`.
 */
@Injectable({ providedIn: 'root' })
export class SaasAuthService {
  private readonly http = inject(HttpClient);
  private readonly sesion = inject(SaasSessionService);

  /** URL base de la API normalizada (sin barra final). */
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /**
   * `POST /auth/tenant/login`.
   *
   * `extra=forbid` en el backend: se envían exactamente los cuatro campos.
   * La respuesta 200 NO se guarda aquí; la página llama a
   * `SaasSessionService.guardarSesion()` para que exista un único dueño del
   * almacenamiento.
   */
  login(datos: TenantLoginRequest): Observable<TenantLoginResponse> {
    return this.http.post<TenantLoginResponse>(
      `${this.apiUrl}/auth/tenant/login`,
      datos,
    );
  }

  /** `GET /auth/tenant/me` — identidad de la membresía autenticada. */
  me(): Observable<TenantMe> {
    return this.http.get<TenantMe>(`${this.apiUrl}/auth/tenant/me`);
  }

  /** `POST /auth/tenant/invitaciones/aceptar` — acepta una invitación. */
  aceptarInvitacion(
    datos: TenantInvitacionAceptarRequest,
  ): Observable<TenantInvitacionAceptarResponse> {
    return this.http.post<TenantInvitacionAceptarResponse>(
      `${this.apiUrl}/auth/tenant/invitaciones/aceptar`,
      datos,
    );
  }

  /**
   * Cierra la sesión.
   *
   * El contrato tenant NO expone un endpoint de logout: es suficiente con
   * descartar el JWT local. Se delega en `SaasSessionService` para no duplicar
   * el acceso al almacenamiento.
   */
  logout(): void {
    this.sesion.cerrarSesion();
  }
}
