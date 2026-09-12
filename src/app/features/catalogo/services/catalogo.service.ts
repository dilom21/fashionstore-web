import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { CatalogoFiltros } from '../models/catalogo-filtros.model';

/**
 * Servicio público del catálogo (CU09).
 *
 * Consume el contrato público real del backend:
 *   GET /catalogo/filtros -> opciones activas de categorías, tallas, colores,
 *   temporadas, colecciones y sucursales.
 *
 * No requiere JWT. Los productos y la disponibilidad se obtienen reutilizando
 * `ProductosService` (CU07), por lo que este servicio solo cubre los filtros.
 */
@Injectable({ providedIn: 'root' })
export class CatalogoService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** GET /catalogo/filtros (solo opciones activas). */
  obtenerFiltros(): Observable<CatalogoFiltros> {
    return this.http.get<CatalogoFiltros>(`${this.apiUrl}/catalogo/filtros`);
  }
}
