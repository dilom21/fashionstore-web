import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import {
  Talla,
  TallaCreatePayload,
  TallaEstadoPayload,
  TallaListarFiltros,
  TallaUpdatePayload,
} from '../models/talla.model';

/**
 * Servicio de Tallas (CU07).
 *
 * Endpoints reales del backend FastAPI:
 * GET /tallas, GET /tallas/{id}, POST /tallas, PATCH /tallas/{id},
 * PATCH /tallas/{id}/estado.
 *
 * El JWT se adjunta automáticamente mediante el interceptor global.
 */
@Injectable({ providedIn: 'root' })
export class TallasService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** GET /tallas con filtros buscar / estado. */
  listarTallas(filtros: TallaListarFiltros = {}): Observable<Talla[]> {
    return this.http.get<Array<{ id: number; nombre: string }>>(`${this.apiUrl}/tenant/catalogo/tallas`).pipe(
      map((tallas) => tallas.map((talla) => ({ ...talla, estado: true })).filter((talla) =>
        (!filtros.buscar || talla.nombre.toLocaleLowerCase().includes(filtros.buscar.trim().toLocaleLowerCase())) &&
        filtros.estado !== false)),
    );
  }

  /** GET /tallas/{talla_id}. */
  obtenerTalla(tallaId: number): Observable<Talla> {
    return this.http.get<Talla>(`${this.apiUrl}/tallas/${tallaId}`);
  }

  /** POST /tallas. */
  crearTalla(payload: TallaCreatePayload): Observable<Talla> {
    return this.http.post<Talla>(`${this.apiUrl}/tallas`, payload);
  }

  /** PATCH /tallas/{talla_id} (solo campos modificados). */
  actualizarTalla(
    tallaId: number,
    payload: TallaUpdatePayload,
  ): Observable<Talla> {
    return this.http.patch<Talla>(
      `${this.apiUrl}/tallas/${tallaId}`,
      payload,
    );
  }

  /** PATCH /tallas/{talla_id}/estado. */
  cambiarEstadoTalla(tallaId: number, estado: boolean): Observable<Talla> {
    const payload: TallaEstadoPayload = { estado };
    return this.http.patch<Talla>(
      `${this.apiUrl}/tallas/${tallaId}/estado`,
      payload,
    );
  }
}
