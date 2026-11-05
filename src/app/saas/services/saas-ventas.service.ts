import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  VentaComercialResumen,
  VentaContadoRespuesta,
  VentaContadoSolicitud,
  ComprobanteContadoTenant,
} from '../models/tenant.models';

/**
 * Ventas de la empresa (`/tenant/ventas/*` y `/tenant/comercial/ventas`).
 *
 * - `POST /tenant/ventas/contado`: ADMINISTRADOR, ENCARGADO_SUCURSAL o CAJERO
 *   (personal). El backend puede estar apagado y responder 503.
 * - `GET /tenant/comercial/ventas`: solo ADMINISTRADOR, con vista mínima
 *   `{id, estado}`.
 *
 * El `empresa_id` y los precios NUNCA viajan desde la UI: el servidor deriva
 * ambos. Aquí solo se construyen las peticiones exactas del contrato.
 */
@Injectable({ providedIn: 'root' })
export class SaasVentasService {
  private readonly http = inject(HttpClient);

  /** URL base de la API normalizada (sin barra final). */
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** Prefijo exacto de la venta presencial (sin `/` final). */
  private readonly baseContado = `${this.apiUrl}/tenant/ventas/contado`;

  /** Prefijo exacto de la consulta comercial (sin `/` final). */
  private readonly baseComercial = `${this.apiUrl}/tenant/comercial/ventas`;

  /**
   * `POST /tenant/ventas/contado` — registra una venta de contado.
   *
   * Respuestas relevantes:
   * - 201: venta nueva (`idempotente: false`).
   * - 200: replay idempotente del mismo `operacion_id` con la misma carga.
   * - 409: `operacion_id` reutilizado con otra carga, o stock insuficiente.
   * - 403: inventario/sucursal de otra empresa o rol no autorizado.
   * - 503: módulo de ventas SaaS deshabilitado.
   */
  registrarContado(
    dto: VentaContadoSolicitud,
  ): Observable<VentaContadoRespuesta> {
    return this.http.post<VentaContadoRespuesta>(this.baseContado, dto);
  }

  /**
   * `GET /tenant/comercial/ventas` — ventas recientes (vista mínima).
   *
   * Sin `limit`/`offset` se omiten los parámetros y el backend aplica sus
   * defaults (`limit=50`, `offset=0`).
   */
  listarVentas(
    limit?: number,
    offset?: number,
  ): Observable<VentaComercialResumen[]> {
    let params = new HttpParams();
    if (limit !== undefined) {
      params = params.set('limit', limit);
    }
    if (offset !== undefined) {
      params = params.set('offset', offset);
    }
    return this.http.get<VentaComercialResumen[]>(this.baseComercial, {
      params,
    });
  }

  /** `GET /tenant/ventas/contado/{id}/comprobante` — CU23 receipt. */
  comprobanteContado(ventaId: number): Observable<ComprobanteContadoTenant> {
    return this.http.get<ComprobanteContadoTenant>(
      `${this.baseContado}/${ventaId}/comprobante`,
    );
  }
}
