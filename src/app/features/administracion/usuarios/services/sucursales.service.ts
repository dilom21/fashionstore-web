import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import { SucursalActiva } from '../models/catalogos.model';

/**
 * Catálogo de sucursales activas (CU03).
 *
 * Consume GET /sucursales (endpoint público del backend, devuelve solo
 * sucursales activas). Se usa en el selector del formulario y en el filtro
 * del listado de usuarios.
 */
@Injectable({ providedIn: 'root' })
export class SucursalesService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** GET /sucursales */
  listarSucursalesActivas(): Observable<SucursalActiva[]> {
    return this.http.get<SucursalActiva[]>(`${this.apiUrl}/sucursales`);
  }
}
