import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  AltaPersonalRespuesta,
  AltaPersonalSolicitud,
  TenantUsuarioMembresia,
  TenantUsuarioSucursal,
} from '../models/tenant.models';

/**
 * Personal y membresías de la empresa (`/tenant/empresa/usuarios`).
 *
 * Todo el recurso exige ADMINISTRADOR de la empresa (403 en otro caso); el
 * alta y el cambio de sucursal exigen además `PERSONAL/ADMINISTRAR`. El
 * `empresa_id` siempre se resuelve en el backend desde el JWT.
 *
 * El alta NO envía contraseña: el backend devuelve una invitación de un solo
 * uso cuyo token solo se puede ver en esa respuesta.
 */
@Injectable({ providedIn: 'root' })
export class SaasPersonalService {
  private readonly http = inject(HttpClient);

  /** URL base de la API normalizada (sin barra final). */
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** Prefijo exacto del recurso (sin `/` final). */
  private readonly base = `${this.apiUrl}/tenant/empresa/usuarios`;

  /** `GET /tenant/empresa/usuarios` — personal con rol, sucursal y estados. */
  listar(): Observable<TenantUsuarioMembresia[]> {
    return this.http.get<TenantUsuarioMembresia[]>(this.base);
  }

  /**
   * `POST /tenant/empresa/usuarios` — alta de una cuenta NUEVA con invitación.
   *
   * Errores esperables: 409 si el correo ya existe (mensaje neutro) o si el
   * documento está duplicado en la empresa, 422 por validación de campos.
   */
  alta(dto: AltaPersonalSolicitud): Observable<AltaPersonalRespuesta> {
    return this.http.post<AltaPersonalRespuesta>(this.base, dto);
  }

  /**
   * `PATCH /tenant/empresa/usuarios/{id}/estado` — activa o desactiva la
   * membresía (no toca la cuenta global del usuario).
   *
   * Errores esperables: 403 al intentar desactivar la propia membresía, 409 si
   * la empresa quedaría sin administrador activo.
   */
  cambiarEstado(
    id: number,
    estado: boolean,
  ): Observable<TenantUsuarioMembresia> {
    return this.http.patch<TenantUsuarioMembresia>(`${this.base}/${id}/estado`, {
      estado,
    });
  }

  /**
   * `PATCH /tenant/empresa/usuarios/{id}/rol` — cambia el rol empresarial.
   *
   * Errores esperables: 403 al cambiar el propio rol, 422 si el rol no es
   * asignable al personal de la empresa.
   */
  cambiarRol(id: number, rolId: number): Observable<TenantUsuarioMembresia> {
    return this.http.patch<TenantUsuarioMembresia>(`${this.base}/${id}/rol`, {
      rol_id: rolId,
    });
  }

  /**
   * `PATCH /tenant/empresa/usuarios/{id}/sucursal` — mueve al empleado.
   *
   * Errores esperables: 409 si el usuario no tiene empleado activo, 404 si la
   * sucursal destino no está disponible en la empresa.
   */
  cambiarSucursal(
    id: number,
    sucursalId: number,
  ): Observable<TenantUsuarioSucursal> {
    return this.http.patch<TenantUsuarioSucursal>(
      `${this.base}/${id}/sucursal`,
      { sucursal_id: sucursalId },
    );
  }
}
