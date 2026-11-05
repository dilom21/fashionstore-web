import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  AccionDevolucionRespuesta,
  DevolucionCreada,
  DevolucionCrear,
  DevolucionDetalle,
  DevolucionProcesada,
  DevolucionResumen,
  EstadoDevolucion,
  VentaLineasTenant,
} from '../models/tenant.models';

/**
 * Filtros de `GET /tenant/devoluciones`.
 *
 * `estado` se omite cuando es `null`/`undefined`; `limit` admite 1..200 con 50
 * por defecto en el backend.
 */
export interface FiltroDevolucionesTenant {
  estado?: EstadoDevolucion | null;
  limit?: number;
  offset?: number;
}

/**
 * Devoluciones de venta de la empresa (`/tenant/devoluciones`).
 *
 * Contrato:
 * - Lectura y escritura: ADMINISTRADOR y ENCARGADO_SUCURSAL.
 * - `SAAS_DEVOLUCIONES_ENABLED` apagado responde 503.
 *
 * `GET /ventas/{venta_id}/lineas` (consulta de disponibilidad por venta) y
 * `POST /tenant/devoluciones` (alta) existen desde 5BZ; siguen sin existir la
 * edición ni el borrado de una devolución.
 *
 * `aprobar` y `rechazar` se envían SIN cuerpo; `procesar` exige únicamente
 * `{operacion_id}`. Los reembolsos son informativos: este servicio no ejecuta
 * pagos ni devoluciones financieras.
 */
@Injectable({ providedIn: 'root' })
export class SaasDevolucionesService {
  private readonly http = inject(HttpClient);

  /** URL base de la API normalizada (sin barra final). */
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** Prefijo exacto del recurso (sin `/` final). */
  private readonly base = `${this.apiUrl}/tenant/devoluciones`;

  /**
   * `GET /tenant/devoluciones` — listado paginado y filtrable.
   *
   * El backend NO devuelve un total: la UI pagina con `offset` y el tamaño de
   * la página.
   */
  listar(
    filtros: FiltroDevolucionesTenant = {},
  ): Observable<DevolucionResumen[]> {
    let params = new HttpParams();

    if (filtros.estado !== undefined && filtros.estado !== null) {
      params = params.set('estado', filtros.estado);
    }
    if (filtros.limit !== undefined) {
      params = params.set('limit', filtros.limit);
    }
    if (filtros.offset !== undefined) {
      params = params.set('offset', filtros.offset);
    }

    return this.http.get<DevolucionResumen[]>(this.base, { params });
  }

  /**
   * `GET /tenant/devoluciones/{id}` — resumen + ítems + reembolso.
   *
   * `reembolso` puede ser `null` mientras la devolución no se procesó.
   */
  obtener(id: number): Observable<DevolucionDetalle> {
    return this.http.get<DevolucionDetalle>(`${this.base}/${id}`);
  }

  /**
   * `GET /tenant/devoluciones/ventas/{venta_id}/lineas` — líneas devolvibles.
   *
   * 404 si la venta no existe o es de otra empresa (el backend no distingue
   * ambas), 403 sin rol autorizado o con el flag apagado.
   */
  lineasVenta(ventaId: number): Observable<VentaLineasTenant> {
    return this.http.get<VentaLineasTenant>(
      `${this.base}/ventas/${ventaId}/lineas`,
    );
  }

  /**
   * `POST /tenant/devoluciones` — crea una devolución en estado SOLICITADA.
   *
   * 201 en el alta y 200 en el replay idempotente del mismo `operacion_id` con
   * la misma carga. Errores esperables: 403, 404 (venta ajena), 409 por
   * conflicto/disponibilidad y 422 por validación.
   */
  crear(dto: DevolucionCrear): Observable<DevolucionCreada> {
    return this.http.post<DevolucionCreada>(this.base, dto);
  }

  /** `POST /tenant/devoluciones/{id}/aprobar` — SIN cuerpo (200 replay). */  aprobar(id: number): Observable<AccionDevolucionRespuesta> {
    return this.http.post<AccionDevolucionRespuesta>(
      `${this.base}/${id}/aprobar`,
      null,
    );
  }

  /** `POST /tenant/devoluciones/{id}/rechazar` — SIN cuerpo (200 replay). */
  rechazar(id: number): Observable<AccionDevolucionRespuesta> {
    return this.http.post<AccionDevolucionRespuesta>(
      `${this.base}/${id}/rechazar`,
      null,
    );
  }

  /**
   * `POST /tenant/devoluciones/{id}/procesar` — cuerpo `{operacion_id}`.
   *
   * Misma carga con el mismo UUID responde 200 (replay); otra carga responde
   * 409 (`Conflicto en la devolucion`).
   */
  procesar(
    id: number,
    operacionId: string,
  ): Observable<DevolucionProcesada> {
    return this.http.post<DevolucionProcesada>(
      `${this.base}/${id}/procesar`,
      { operacion_id: operacionId },
    );
  }
}
