import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import {
  Usuario,
  UsuarioCreatePayload,
  UsuarioEstadoPayload,
  UsuarioListResponse,
  UsuarioListarFiltros,
  UsuarioUpdatePayload,
} from '../models/usuario.model';

/**
 * Servicio de Gestión de Usuarios (CU03).
 *
 * Consume únicamente los endpoints reales del backend FastAPI:
 * GET    /usuarios
 * GET    /usuarios/{usuario_id}
 * POST   /usuarios
 * PATCH  /usuarios/{usuario_id}
 * PATCH  /usuarios/{usuario_id}/estado
 *
 * El JWT se adjunta automáticamente mediante el interceptor global.
 */
@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** GET /usuarios con filtros opcionales. */
  listarUsuarios(filtros: UsuarioListarFiltros = {}): Observable<UsuarioListResponse> {
    let params = new HttpParams();

    const buscar = filtros.buscar?.trim();
    if (buscar) {
      params = params.set('buscar', buscar);
    }
    if (filtros.rol_id !== undefined && filtros.rol_id !== null) {
      params = params.set('rol_id', filtros.rol_id.toString());
    }
    if (filtros.estado !== undefined && filtros.estado !== null) {
      params = params.set('estado', String(filtros.estado));
    }
    if (filtros.sucursal_id !== undefined && filtros.sucursal_id !== null) {
      params = params.set('sucursal_id', filtros.sucursal_id.toString());
    }

    return this.http.get<UsuarioListResponse>(`${this.apiUrl}/usuarios`, { params });
  }

  /** GET /usuarios/{usuario_id}. */
  obtenerUsuario(usuarioId: number): Observable<Usuario> {
    return this.http.get<Usuario>(`${this.apiUrl}/usuarios/${usuarioId}`);
  }

  /** POST /usuarios (201 Created). */
  crearUsuario(payload: UsuarioCreatePayload): Observable<Usuario> {
    return this.http.post<Usuario>(`${this.apiUrl}/usuarios`, payload);
  }

  /** PATCH /usuarios/{usuario_id} (actualización general y cambio de rol). */
  actualizarUsuario(usuarioId: number, payload: UsuarioUpdatePayload): Observable<Usuario> {
    return this.http.patch<Usuario>(`${this.apiUrl}/usuarios/${usuarioId}`, payload);
  }

  /** PATCH /usuarios/{usuario_id}/estado (habilitar/deshabilitar). */
  cambiarEstadoUsuario(usuarioId: number, estado: boolean): Observable<Usuario> {
    const payload: UsuarioEstadoPayload = { estado };
    return this.http.patch<Usuario>(`${this.apiUrl}/usuarios/${usuarioId}/estado`, payload);
  }
}
