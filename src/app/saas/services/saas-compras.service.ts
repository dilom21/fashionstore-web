import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  EstadoOrdenCompra,
  OrdenCompraCreada,
  OrdenCompraCrear,
  OrdenCompraDetalle,
  OrdenCompraResumen,
  RecepcionResultado,
  RecepcionSolicitud,
  TransicionOrdenCompra,
} from '../models/tenant.models';

/**
 * Filtros de `GET /tenant/ordenes-compra`.
 *
 * Los nombres coinciden con los query params del backend. Un valor
 * `null`/`undefined` se omite (el backend aplica su default: `limit=50`).
 */
export interface FiltroOrdenesCompraTenant {
  estado?: EstadoOrdenCompra | null;
  proveedor_id?: number | null;
  sucursal_id?: number | null;
  limit?: number;
  offset?: number;
}

/**
 * Órdenes de compra de la empresa (`/tenant/ordenes-compra`).
 *
 * Contrato:
 * - Lectura y escritura: ADMINISTRADOR y ENCARGADO_SUCURSAL.
 * - `SAAS_COMPRAS_ENABLED` apagado responde 503.
 *
 * `POST /tenant/ordenes-compra` (alta) existe desde 5BZ. Sigue sin existir
 * editar ni `PUT /detalles`: este servicio no inventa esas operaciones.
 *
 * `enviar`, `aprobar`/`rechazar` de devoluciones y los `PATCH` de reserva se
 * envían SIN cuerpo o con `{}` según el contrato exacto de cada ruta.
 */
@Injectable({ providedIn: 'root' })
export class SaasComprasService {
  private readonly http = inject(HttpClient);

  /** URL base de la API normalizada (sin barra final). */
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** Prefijo exacto del recurso (sin `/` final). */
  private readonly base = `${this.apiUrl}/tenant/ordenes-compra`;

  /**
   * `GET /tenant/ordenes-compra` — listado paginado y filtrable.
   *
   * El backend NO devuelve un total: la paginación se resuelve con `offset` y
   * el tamaño de la página.
   */
  listar(
    filtros: FiltroOrdenesCompraTenant = {},
  ): Observable<OrdenCompraResumen[]> {
    let params = new HttpParams();

    if (filtros.estado !== undefined && filtros.estado !== null) {
      params = params.set('estado', filtros.estado);
    }
    if (esEnteroPositivo(filtros.proveedor_id)) {
      params = params.set('proveedor_id', filtros.proveedor_id);
    }
    if (esEnteroPositivo(filtros.sucursal_id)) {
      params = params.set('sucursal_id', filtros.sucursal_id);
    }
    if (filtros.limit !== undefined) {
      params = params.set('limit', filtros.limit);
    }
    if (filtros.offset !== undefined) {
      params = params.set('offset', filtros.offset);
    }

    return this.http.get<OrdenCompraResumen[]>(this.base, { params });
  }

  /** `GET /tenant/ordenes-compra/{id}` — resumen + líneas (404 si es ajena). */
  obtener(id: number): Observable<OrdenCompraDetalle> {
    return this.http.get<OrdenCompraDetalle>(`${this.base}/${id}`);
  }

  /**
   * `POST /tenant/ordenes-compra` — crea una orden en estado BORRADOR.
   *
   * 201 en el alta y 200 en el replay idempotente del mismo cuerpo. Errores
   * esperables: 403 por rol, 409 por conflicto de datos, 422 por validación y
   * 503 con el módulo apagado.
   */
  crearOrden(dto: OrdenCompraCrear): Observable<OrdenCompraCreada> {
    return this.http.post<OrdenCompraCreada>(this.base, dto);
  }

  /**
   * `POST /tenant/ordenes-compra/{id}/enviar` — SIN cuerpo.
   *
   * Errores esperables: 403 por rol, 404 si es ajena, 409 por estado
   * (solo una orden `BORRADOR` puede enviarse), 503 con el módulo apagado.
   */
  enviar(id: number): Observable<TransicionOrdenCompra> {
    return this.http.post<TransicionOrdenCompra>(`${this.base}/${id}/enviar`, null);
  }

  /**
   * `POST /tenant/ordenes-compra/{id}/cancelar` — cuerpo `{observacion?}`.
   *
   * Se envía siempre un objeto JSON (`{}` sin observación); el backend admite
   * cuerpo ausente, pero el contrato de esta UI es explícito.
   */
  cancelar(
    id: number,
    observacion?: string | null,
  ): Observable<TransicionOrdenCompra> {
    return this.http.post<TransicionOrdenCompra>(
      `${this.base}/${id}/cancelar`,
      construirCuerpoObservacion(observacion),
    );
  }

  /**
   * `POST /tenant/ordenes-compra/{id}/recepciones` — recibe mercadería.
   *
   * 201 en el alta y 200 en el replay idempotente del mismo `operacion_id`
   * con la misma carga; 409 si el identificador se reutiliza con otra carga.
   */
  recepcionar(
    id: number,
    dto: RecepcionSolicitud,
  ): Observable<RecepcionResultado> {
    return this.http.post<RecepcionResultado>(
      `${this.base}/${id}/recepciones`,
      dto,
    );
  }
}

/** Cuerpo de cancelación: omite la observación vacía y nunca envía `null`. */
export function construirCuerpoObservacion(
  observacion?: string | null,
): { observacion?: string } {
  const texto = (observacion ?? '').trim();
  return texto.length > 0 ? { observacion: texto } : {};
}

/** `true` si el valor es un entero >= 1. */
function esEnteroPositivo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 1;
}
